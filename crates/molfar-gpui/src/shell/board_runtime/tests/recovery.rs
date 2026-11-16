use super::{super::*, fixtures::*};
use gpui::TestAppContext;
use molfar_core::task_board::stage::{agent::AgentStage, choice, lifecycle::types::StageAction};

fn prepared(fixture: &Fixture) -> prepare::Launch {
    prepared_round(fixture, 1)
}

fn prepared_round(fixture: &Fixture, round: i64) -> prepare::Launch {
    let revision = fixture.card().updated_at;
    let card = {
        let mut store = locked(&fixture.store).unwrap();
        store
            .board_stage_action("card", revision, StageAction::Start)
            .unwrap();
        rusqlite::Connection::open(store.database_path())
            .unwrap()
            .execute(
                "UPDATE task_board_cards SET grill_round=?1 WHERE id='card'",
                [round],
            )
            .unwrap();
        store.board_claim_next_stage().unwrap().unwrap()
    };
    let defaults = prepare::Defaults {
        fixture: Some(fixture.provider.clone()),
        card,
        selection: choice::select(AgentStage::Grill, None, "{}", Kind::Codex).unwrap(),
        model: None,
        account: Default::default(),
        disabled_skills: Vec::new(),
    };
    match prepare::prepare(&fixture.store, "prepared-run", defaults).unwrap() {
        prepare::Prepared::Launch(launch) => *launch,
        _ => panic!("fixture preparation failed"),
    }
}

#[gpui::test]
fn cancellation_before_install_never_submits_prepared_prompt(cx: &mut TestAppContext) {
    let fixture = Fixture::new();
    let launch = prepared(&fixture);
    let session = launch.summary.id;
    let revision = fixture.card().updated_at;
    locked(&fixture.store)
        .unwrap()
        .board_stage_action("card", revision, StageAction::Cancel)
        .unwrap();
    let window = fixture.window(cx);
    window
        .update(cx, |shell, _, cx| {
            shell
                .board_state
                .preparing
                .insert("card".into(), launch.run_id.clone());
            shell.install_board_launch("card".into(), launch, cx);
        })
        .unwrap();
    cx.run_until_parked();
    window
        .update(cx, |shell, _, _| {
            assert!(shell.board_state.preparing.is_empty());
            assert!(!shell.board_state.running.contains_key(&session));
        })
        .unwrap();
    assert!(!fixture.root.join("submissions").exists());
    assert_eq!(fixture.card().run_state, "failed");
}

#[gpui::test]
fn restart_with_unsent_preparation_interrupts_without_replay(cx: &mut TestAppContext) {
    for round in [1, 2] {
        let fixture = Fixture::new();
        drop(prepared_round(&fixture, round));
        let window = fixture.window(cx);
        window
            .update(cx, |shell, _, cx| shell.poll_board(true, cx))
            .unwrap();
        wait_until(cx, || fixture.card().run_state == "failed");
        let snapshot = locked(&fixture.store)
            .unwrap()
            .board_snapshot(None, false, Some("card"))
            .unwrap();
        assert_eq!(snapshot.runs[0].status, "interrupted");
        assert_eq!(fixture.card().grill_round, round);
        assert!(!fixture.root.join("submissions").exists());
    }
}

#[test]
fn cancellation_after_preparation_is_refused_at_native_prompt_acceptance() {
    let fixture = Fixture::new();
    let mut launch = prepared(&fixture);
    let session = launch.summary.id;
    let before = locked(&fixture.store).unwrap().load(session).unwrap().rows;
    assert!(
        locked(&fixture.store)
            .unwrap()
            .board_stage_is_current(&launch.run_id)
            .unwrap()
    );
    let revision = fixture.card().updated_at;
    locked(&fixture.store)
        .unwrap()
        .board_stage_action("card", revision, StageAction::Cancel)
        .unwrap();
    launch.settings.familiar_message_id = Some(format!(
        "app-prompt-{}",
        molfar_core::familiar::files::content_hash(&launch.run_id)
    ));
    let (_controls, receiver) = std::sync::mpsc::channel();
    let (updates, results) = async_channel::unbounded();
    crate::runtime::run_turn(
        launch.summary,
        "cancelled prompt".into(),
        launch.settings,
        receiver,
        fixture.store.clone(),
        Arc::new(std::sync::atomic::AtomicBool::new(false)),
        updates,
    );
    assert!(!fixture.root.join("submissions").exists());
    let mut refused = false;
    while let Ok(update) = results.try_recv() {
        refused |= update.status.contains("cancelled")
            || update.rows.iter().any(|row| row.text.contains("cancelled"));
    }
    assert!(refused);
    assert_eq!(
        locked(&fixture.store).unwrap().load(session).unwrap().rows,
        before
    );
    assert!(
        locked(&fixture.store)
            .unwrap()
            .app_turn_result(session, "prepared-run")
            .unwrap()
            .is_none()
    );
}

#[gpui::test]
fn artifact_save_failure_finishes_failed_and_allows_retry(cx: &mut TestAppContext) {
    let fixture = Fixture::new();
    std::fs::create_dir_all(fixture.root.join("task-board/card/plan-1.md")).unwrap();
    let window = fixture.window(cx);
    window
        .update(cx, |shell, _, cx| {
            shell.board_action(
                "card".into(),
                fixture.card().updated_at,
                StageAction::Start,
                cx,
            );
        })
        .unwrap();
    wait_until(cx, || fixture.card().run_state == "failed");
    assert_eq!(
        std::fs::read_to_string(fixture.root.join("submissions"))
            .unwrap()
            .lines()
            .count(),
        1
    );
    let card = fixture.card();
    let error = card.last_error.unwrap_or_default();
    assert!(error.contains("Saving stage artifacts failed"), "{error}");
    let snapshot = locked(&fixture.store)
        .unwrap()
        .board_snapshot(None, false, Some("card"))
        .unwrap();
    assert_eq!(snapshot.runs[0].status, "failed");
    assert_eq!(snapshot.artifacts.len(), 1);
    assert!(
        locked(&fixture.store)
            .unwrap()
            .board_stage_action("card", card.updated_at, StageAction::Retry(None))
            .is_ok()
    );
}

#[gpui::test]
fn deleted_session_after_restart_interrupts_only_its_run(cx: &mut TestAppContext) {
    let fixture = Fixture::new();
    let launch = prepared(&fixture);
    let persisted = locked(&fixture.store)
        .unwrap()
        .persisted_session_id(launch.summary.id)
        .unwrap();
    drop(launch);
    let path = locked(&fixture.store).unwrap().database_path().to_owned();
    rusqlite::Connection::open(&path)
        .unwrap()
        .execute("DELETE FROM sessions WHERE id=?1", [&persisted])
        .unwrap();
    *locked(&fixture.store).unwrap() = molfar_core::store::Store::open_desktop(&path).unwrap();

    let window = fixture.window(cx);
    window
        .update(cx, |shell, _, cx| shell.poll_board(true, cx))
        .unwrap();
    wait_until(cx, || fixture.card().run_state == "failed");
    cx.run_until_parked();

    let snapshot = locked(&fixture.store)
        .unwrap()
        .board_snapshot(None, false, Some("card"))
        .unwrap();
    assert_eq!(snapshot.runs[0].status, "interrupted");
    window
        .update(cx, |shell, _, _| {
            assert!(shell.board_state.ownership_ready);
            assert!(shell.error.is_none(), "{:?}", shell.error);
        })
        .unwrap();
}
