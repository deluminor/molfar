use crate::{
    agent::{turn::TurnCompletion, TurnInfo, TurnMetrics},
    consumption::{TokenCounts, UsageRecord},
    store::Store,
};
use serde_json::json;
use std::path::Path;

fn metrics(output: u64) -> serde_json::Value {
    json!({"inputTokens": 10, "outputTokens": output, "cacheReadTokens": 0, "cacheWriteTokens": 0})
}

fn legacy_history() -> Vec<serde_json::Value> {
    vec![
        json!({"id":"a","role":"user","text":"One","startedAt":1_000,"durationMs":50,
            "turnModel":{"harness":"claude","name":"Opus 5.5","id":"claude:opus"},
            "turnMetrics":metrics(5)}),
        json!({"id":"a1","role":"assistant","text":"Done"}),
        json!({"id":"b","role":"user","text":"Two","turnMetrics":metrics(7)}),
        json!({"id":"b1","role":"assistant","text":"Undated"}),
        json!({"id":"c","role":"user","text":"Three","startedAt":3_000,
            "turnModel":{"harness":"cursor","name":"Auto","id":"cursor:auto"}}),
        json!({"id":"c1","role":"assistant","text":"Unreported"}),
    ]
}

fn session_with(blocks: &[serde_json::Value]) -> (Store, i64) {
    let store = Store::open_desktop(Path::new(":memory:")).unwrap();
    let session = store.create("claude", "/project").unwrap();
    store.shared_store_blocks(session.id, blocks).unwrap();
    (store, session.id)
}

#[test]
fn legacy_receipts_import_once_with_trustworthy_dates_only() {
    let (store, id) = session_with(&legacy_history());

    let first = store.session_usage(id).unwrap();
    let again = store.session_usage(id).unwrap();

    assert_eq!(first, again);
    assert_eq!(first.tokens.output, 5);
    assert_eq!(first.reported_runs, 1);
    assert_eq!(first.unreported_runs, 1);
    let records = store.session_consumption(id).unwrap();
    assert_eq!(
        records.len(),
        2,
        "undated receipt without identity is skipped"
    );
    assert_eq!(records[0].source_key, "legacy:1000");
    assert_eq!(records[0].reported_at_ms, Some(1_050));
    assert_eq!(records[0].model_name.as_deref(), Some("Opus 5.5"));
}

#[test]
fn live_receipts_reconcile_under_their_own_key_without_double_counting() {
    let (store, id) =
        session_with(&[json!({"id":"a","role":"user","text":"One","startedAt":1_000})]);
    let receipt = TurnInfo {
        receipt_id: Some("receipt-1".into()),
        provider: "codex".into(),
        model_id: Some("gpt-6.1-sol".into()),
        started_at: Some(1_000),
        completed_at: Some(1_100),
        completion: Some(TurnCompletion::Succeeded {
            completed_at: 1_100,
        }),
        metrics: Some(TurnMetrics {
            input_tokens: 40,
            output_tokens: 2,
            ..Default::default()
        }),
        ..Default::default()
    };
    store.save_turn_receipt(id, 1, &receipt).unwrap();

    assert_eq!(store.session_usage(id).unwrap().reported_runs, 1);
    for record in UsageRecord::from_turn(&receipt) {
        store.save_consumption(id, &record).unwrap();
    }

    let records = store.session_consumption(id).unwrap();
    assert_eq!(records.len(), 1);
    assert_eq!(records[0].source_key, "receipt-1");
    assert_eq!(
        records[0].tokens,
        Some(TokenCounts {
            input: 40,
            output: 2,
            ..Default::default()
        })
    );
}

#[test]
fn rewinding_history_keeps_incurred_usage() {
    let (store, id) = session_with(&legacy_history());
    assert_eq!(store.session_usage(id).unwrap().tokens.output, 5);

    store.shared_store_blocks(id, &[]).unwrap();

    assert_eq!(store.session_usage(id).unwrap().tokens.output, 5);
}

#[test]
fn read_only_stores_show_saved_usage_without_importing() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("molfar.db");
    let store = Store::open_desktop(&path).unwrap();
    let session = store.create("claude", "/project").unwrap();
    store
        .shared_store_blocks(session.id, &legacy_history())
        .unwrap();
    drop(store);

    let reader = Store::read_desktop(&path).unwrap();
    let id = reader.sessions().unwrap()[0].id;

    assert_eq!(reader.session_usage(id).unwrap().reported_runs, 0);
}
