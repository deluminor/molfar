use super::fixtures::conversation;
use super::*;

#[test]
fn cancelled_run_records_one_unreported_entry_keyed_by_its_saved_receipt() {
    let (store, id, _) = conversation();
    let mut summary = locked(&store).unwrap().sessions().unwrap().pop().unwrap();
    summary.provider = "invalid-test-provider".into();
    let (tx, rx) = async_channel::bounded(8);
    let (_control, controls) = std::sync::mpsc::channel();

    run_turn(
        summary,
        "Stopped before any report".into(),
        Settings::default(),
        controls,
        store.clone(),
        Arc::new(AtomicBool::new(true)),
        tx,
    );
    assert!(rx.try_recv().unwrap().finished);

    let store = locked(&store).unwrap();
    let records = store.session_consumption(id).unwrap();
    let receipts = store.agent_settings(id).unwrap().unwrap().turns;
    let receipt_ids: Vec<_> = receipts
        .values()
        .filter_map(|info| info.receipt_id.clone())
        .collect();

    assert_eq!(records.len(), 1, "{records:?}");
    assert_eq!(records[0].tokens, None);
    assert_eq!(receipt_ids, vec![records[0].source_key.clone()]);
}

#[test]
fn joined_steer_receipts_never_reach_the_ledger() {
    let (store, id, _) = conversation();
    let steer = molfar_core::agent::TurnInfo {
        receipt_id: Some("steer".into()),
        joined_turn: Some(1),
        provider: "codex".into(),
        metrics: Some(molfar_core::agent::TurnMetrics {
            output_tokens: 9,
            ..Default::default()
        }),
        ..Default::default()
    };

    save_turn_consumption(&store, id, &steer).unwrap();

    assert!(
        locked(&store)
            .unwrap()
            .session_consumption(id)
            .unwrap()
            .is_empty()
    );
}
