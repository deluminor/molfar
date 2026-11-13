use super::tests::{completed, fixture, root};
use crate::{agent::TurnInfo, store::Store};
use serde_json::json;

#[test]
fn turn_receipt_stale_same_offset_and_read_only_writes_preserve_source() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("molfar.db");
    let store = Store::open_desktop(&path).unwrap();
    let session = store.create("codex", "/project").unwrap();
    store
        .shared_store_blocks(session.id, &[root("run")])
        .unwrap();
    store.load(session.id).unwrap();
    let external = Store::open_desktop(&path).unwrap();
    let replacement = json!({"id":"replacement","role":"user","text":"Preserve","startedAt":200});
    external
        .shared_store_blocks(session.id, std::slice::from_ref(&replacement))
        .unwrap();
    assert!(store
        .save_turn_receipt(session.id, 1, &completed())
        .unwrap_err()
        .contains("changed in another window"));
    assert_eq!(
        external.shared_blocks(session.id).unwrap(),
        vec![replacement]
    );
    drop(external);
    drop(store);
    let before = std::fs::read(&path).unwrap();
    let reader = Store::read_desktop(&path).unwrap();
    assert!(reader
        .save_turn_receipt(session.id, 1, &completed())
        .is_err());
    drop(reader);
    assert_eq!(std::fs::read(&path).unwrap(), before);
}

#[test]
fn turn_receipt_joined_steers_require_explicit_stable_root_provenance() {
    let (store, id) = fixture(vec![
        root("run"),
        json!({"id":"opening","role":"assistant","text":"Opening"}),
        json!({"id":"steer","role":"user","text":"Clarify","sentAt":110}),
        json!({"id":"answer","role":"assistant","text":"Final"}),
    ]);
    let inferred = store.agent_settings(id).unwrap().unwrap();
    assert_eq!(inferred.turns[&3].joined_turn, Some(1));
    store.save_agent_settings(id, &inferred).unwrap();
    assert!(store.shared_blocks(id).unwrap()[2]["nativeJoinedPromptId"].is_null());
    assert!(store
        .app_turn_result(id, "run")
        .unwrap_err()
        .contains("unclassified"));
    store
        .save_turn_receipt(
            id,
            3,
            &TurnInfo {
                joined_turn: Some(1),
                ..Default::default()
            },
        )
        .unwrap();
    store.save_turn_receipt(id, 1, &completed()).unwrap();
    let result = store.app_turn_result(id, "run").unwrap().unwrap();
    assert_eq!(result.text, "Opening\nFinal");
    assert_eq!(result.completion, completed().completion);
    assert_eq!(
        store.shared_blocks(id).unwrap()[2]["nativeJoinedPromptId"],
        "root"
    );
    let before = store.shared_blocks(id).unwrap();
    assert!(store
        .save_turn_receipt(
            id,
            3,
            &TurnInfo {
                joined_turn: Some(3),
                ..Default::default()
            }
        )
        .is_err());
    assert_eq!(store.shared_blocks(id).unwrap(), before);
}

#[test]
fn turn_receipt_outside_viewport_join_does_not_infer_a_different_visible_root() {
    let blocks = [
        json!({"id":"visible","role":"user","text":"Other","startedAt":200}),
        json!({"id":"reply","role":"assistant","text":"Other output"}),
        json!({"id":"steer","role":"user","text":"Earlier root","sentAt":210,"nativeJoinedPromptId":"outside"}),
    ];
    let turns = crate::store::shared::project_turns(&blocks).unwrap();
    assert!(turns.get(&3).is_none_or(|info| info.joined_turn.is_none()));
}

#[test]
fn turn_receipt_invalid_terminal_and_joined_metadata_fail_exact_reads() {
    let mut invalid = root("run");
    invalid["nativeTurnCompletion"] = json!({"status":"unknown","completed_at":200});
    let (store, id) = fixture(vec![invalid]);
    assert!(store.app_turn_result(id, "run").is_err());
    for joined in [json!("outside"), json!(123), json!("steer")] {
        let (store, id) = fixture(vec![
            root("run"),
            json!({"id":"steer","role":"user","text":"Do not trust","nativeJoinedPromptId":joined}),
        ]);
        assert!(store.app_turn_result(id, "run").is_err());
    }
}

#[test]
fn turn_receipt_identity_survives_the_shared_transcript_round_trip() {
    let (store, id) = fixture(vec![root("run")]);
    let mut receipt = completed();
    receipt.receipt_id = Some("receipt-1".into());

    store.save_turn_receipt(id, 1, &receipt).unwrap();

    assert_eq!(
        store.shared_blocks(id).unwrap()[0]["nativeReceiptId"],
        "receipt-1"
    );
    let saved = store.agent_settings(id).unwrap().unwrap();
    assert_eq!(saved.turns[&1].receipt_id.as_deref(), Some("receipt-1"));
}

#[test]
fn turn_receipt_usage_slices_and_tier_survive_the_shared_transcript() {
    let (store, id) = fixture(vec![root("run")]);
    let mut receipt = completed();
    receipt.service_tier = Some("fast".into());
    receipt.usage_slices = vec![crate::consumption::UsageSlice {
        model: "claude-opus-5-5".into(),
        tokens: crate::consumption::TokenCounts {
            output: 4,
            cache_write: 10,
            cache_write_1h: Some(10),
            ..Default::default()
        },
    }];

    store.save_turn_receipt(id, 1, &receipt).unwrap();

    let saved = store.agent_settings(id).unwrap().unwrap();
    assert_eq!(saved.turns[&1].usage_slices, receipt.usage_slices);
    assert_eq!(saved.turns[&1].service_tier.as_deref(), Some("fast"));
}
