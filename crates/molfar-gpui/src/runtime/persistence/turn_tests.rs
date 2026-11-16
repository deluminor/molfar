use super::fixtures::conversation;
use super::*;
use molfar_core::agent::turn::TurnCompletion;

#[test]
fn settled_turn_receipt_persists_without_a_view_and_keeps_newer_picker_settings() {
    let (store, id, transcript) = conversation();
    let mut settings = locked(&store).unwrap().agent_settings(id).unwrap().unwrap();
    settings.revision = 42;
    settings.model = Some("next-turn-model".into());
    locked(&store)
        .unwrap()
        .save_agent_settings(id, &settings)
        .unwrap();
    let started_at = transcript.rows[0].sent_at.unwrap();
    save_turn_receipt(
        &store,
        id,
        1,
        molfar_core::agent::TurnInfo {
            provider: "codex".into(),
            model: "Turn Model".into(),
            model_id: Some("turn-model".into()),
            provider_turn_id: Some("turn-id".into()),
            started_at: Some(started_at),
            duration_ms: 9000,
            duration_known: true,
            completed_at: Some(started_at + 9000),
            completion: Some(TurnCompletion::Succeeded {
                completed_at: started_at + 9000,
            }),
            metrics: Some(molfar_core::agent::TurnMetrics {
                output_tokens: 5,
                ..Default::default()
            }),
            ..Default::default()
        },
    )
    .unwrap();
    let store = locked(&store).unwrap();
    let saved = store.agent_settings(id).unwrap().unwrap();
    assert_eq!(saved.revision, 42);
    assert_eq!(saved.model.as_deref(), Some("next-turn-model"));
    assert_eq!(saved.turns[&1].model, "Turn Model");
    assert_eq!(saved.turns[&1].duration_ms, 9000);
    assert_eq!(saved.turns[&1].provider_turn_id.as_deref(), Some("turn-id"));
    assert_eq!(
        saved.turns[&1].completion,
        Some(TurnCompletion::Succeeded {
            completed_at: started_at + 9000,
        })
    );
    assert_eq!(store.load(id).unwrap().rows, transcript.rows);
}

#[test]
fn cancelled_initial_delivery_replays_accepted_rows_in_the_final_update() {
    let (store, id, history) = conversation();
    let mut summary = locked(&store).unwrap().sessions().unwrap().pop().unwrap();
    // Even a regression in cancellation must never launch a real provider.
    summary.provider = "invalid-test-provider".into();
    let (tx, rx) = async_channel::bounded(8);
    let (_control, controls) = std::sync::mpsc::channel();
    run_turn(
        summary,
        "Accepted before stopping".into(),
        Settings::default(),
        controls,
        store.clone(),
        Arc::new(AtomicBool::new(true)),
        tx,
    );
    let result = rx.try_recv().unwrap();
    assert!(result.finished);
    assert_eq!(result.status, "Ready");
    assert_eq!(result.start, history.rows.len());
    assert_eq!(result.rows.len(), 2);
    assert_eq!(result.rows[0].text, "Accepted before stopping");
    assert_eq!(result.rows[1].role, "assistant");
    let mut visible = history.rows;
    visible.extend(result.rows);
    assert_eq!(visible, locked(&store).unwrap().load(id).unwrap().rows);
    let saved = locked(&store).unwrap().agent_settings(id).unwrap().unwrap();
    assert!(matches!(
        saved
            .turns
            .values()
            .find_map(|turn| turn.completion.as_ref()),
        Some(TurnCompletion::Cancelled { .. })
    ));
    assert!(rx.try_recv().is_err());
}

#[test]
fn rejected_preflight_preserves_existing_history_without_a_provider_launch() {
    let (store, id, transcript) = conversation();
    let summary = locked(&store).unwrap().sessions().unwrap().pop().unwrap();
    let (tx, rx) = async_channel::bounded(2);
    let (_control, controls) = std::sync::mpsc::channel();
    run_turn(
        summary,
        "Unsent".into(),
        Settings {
            worktree_removed: true,
            familiar_message_id: Some("not-accepted".into()),
            ..Default::default()
        },
        controls,
        store.clone(),
        Arc::new(AtomicBool::new(false)),
        tx,
    );
    let result = rx.try_recv().unwrap();
    assert!(result.finished);
    assert!(result.status.contains("worktree"));
    assert!(result.rows.is_empty());
    assert!(
        result.delivered.is_none(),
        "Rejected messages must stay queued"
    );
    assert_eq!(
        locked(&store).unwrap().load(id).unwrap().rows,
        transcript.rows
    );
    assert!(
        locked(&store)
            .unwrap()
            .agent_settings(id)
            .unwrap()
            .unwrap()
            .turns
            .values()
            .all(|turn| turn.completion.is_none())
    );
}

#[test]
fn terminal_failure_is_durable_even_after_the_receiving_window_closes() {
    let (store, id, _) = conversation();
    let mut summary = locked(&store).unwrap().sessions().unwrap().pop().unwrap();
    summary.provider = "invalid-test-provider".into();
    let (tx, rx) = async_channel::bounded(8);
    drop(rx);
    let (_control, controls) = std::sync::mpsc::channel();
    run_turn(
        summary,
        "Window already closed".into(),
        Settings::default(),
        controls,
        store.clone(),
        Arc::new(AtomicBool::new(false)),
        tx,
    );
    let saved = locked(&store).unwrap().agent_settings(id).unwrap().unwrap();
    assert!(matches!(
        saved.turns.values().find_map(|turn| turn.completion.as_ref()),
        Some(TurnCompletion::Failed { error, .. }) if error == "Window closed"
    ));
}

#[test]
fn rejected_receipt_write_cannot_publish_terminal_success() {
    let directory = std::env::temp_dir().join(format!(
        "molfar-terminal-readonly-{}",
        molfar_core::familiar::new_id()
    ));
    std::fs::create_dir(&directory).unwrap();
    let path = directory.join("sessions.db");
    let (store, id, _) = super::fixtures::conversation_at(&path);
    drop(store);
    let store = Arc::new(Mutex::new(Store::read_desktop(&path).unwrap()));
    let result = save_turn_receipt(
        &store,
        id,
        1,
        molfar_core::agent::TurnInfo {
            completion: Some(TurnCompletion::Succeeded { completed_at: 100 }),
            ..Default::default()
        },
    );
    assert!(result.is_err());
    assert!(
        locked(&store)
            .unwrap()
            .agent_settings(id)
            .unwrap()
            .unwrap()
            .turns
            .values()
            .all(|turn| turn.completion.is_none())
    );
    drop(store);
    std::fs::remove_dir_all(directory).unwrap();
}
