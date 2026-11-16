use crate::{
    agent::{turn::TurnCompletion, TurnInfo},
    store::Store,
};
use serde_json::json;
use std::path::Path;

#[test]
fn turn_receipt_terminal_state_and_full_output_are_persisted_by_exact_request() {
    let store = Store::open_desktop(Path::new(":memory:")).unwrap();
    let session = store.create("codex", "/project").unwrap();
    let request = format!(
        "app-prompt-{}",
        crate::familiar::files::content_hash("board-run")
    );
    store.shared_store_blocks(session.id, &[
        json!({"id":"root","role":"user","text":"Task","startedAt":100,"appRequestId":request,"future":{"preserve":true}}),
        json!({"id":"reply","role":"assistant","text":"Complete output"}),
    ]).unwrap();
    let info = TurnInfo {
        completion: Some(TurnCompletion::Succeeded { completed_at: 200 }),
        ..Default::default()
    };
    store.save_turn_receipt(session.id, 1, &info).unwrap();
    let result = store
        .app_turn_result(session.id, "board-run")
        .unwrap()
        .unwrap();
    assert_eq!(result.prompt_id, "root");
    assert_eq!(result.turn, 1);
    assert_eq!(result.completion, info.completion);
    assert_eq!(result.text, "Complete output");
    assert_eq!(
        store.shared_blocks(session.id).unwrap()[0]["future"],
        json!({"preserve":true})
    );
}

pub(super) fn root(request: &str) -> serde_json::Value {
    json!({"id":"root","role":"user","text":"Task","startedAt":100,
        "appRequestId":super::super::app_access::prompt_message_id(request),"future":{"keep":true}})
}

pub(super) fn fixture(blocks: Vec<serde_json::Value>) -> (Store, i64) {
    let store = Store::open_desktop(Path::new(":memory:")).unwrap();
    let session = store.create("codex", "/project").unwrap();
    store.shared_store_blocks(session.id, &blocks).unwrap();
    (store, session.id)
}

pub(super) fn completed() -> TurnInfo {
    TurnInfo {
        completion: Some(TurnCompletion::Succeeded { completed_at: 200 }),
        ..Default::default()
    }
}

#[test]
fn turn_receipt_old_json_has_no_terminal_success_and_variants_roundtrip() {
    let old: TurnInfo =
        serde_json::from_value(json!({"started_at":100,"completed_at":100})).unwrap();
    assert!(old.completion.is_none());
    assert!(serde_json::to_value(old)
        .unwrap()
        .get("completion")
        .is_none());
    for completion in [
        TurnCompletion::Succeeded { completed_at: 200 },
        TurnCompletion::Failed {
            completed_at: 200,
            error: "Provider failed\nwith context".into(),
        },
        TurnCompletion::Cancelled { completed_at: 200 },
    ] {
        assert_eq!(
            serde_json::from_value::<TurnCompletion>(serde_json::to_value(&completion).unwrap())
                .unwrap(),
            completion
        );
    }
    assert!(
        serde_json::from_value::<TurnCompletion>(json!({"status":"ready","completed_at":200}))
            .is_err()
    );
}

#[test]
fn turn_receipt_is_immutable_idempotent_and_survives_stale_settings() {
    let (store, id) = fixture(vec![root("run")]);
    let stale = store.agent_settings(id).unwrap().unwrap();
    assert!(stale.turns[&1].completion.is_none());
    let completed = completed();
    store.save_turn_receipt(id, 1, &completed).unwrap();
    store.save_turn_receipt(id, 1, &completed).unwrap();
    store.save_agent_settings(id, &stale).unwrap();
    store
        .save_turn_receipt(id, 1, &TurnInfo::default())
        .unwrap();
    assert_eq!(
        store
            .app_turn_result(id, "run")
            .unwrap()
            .unwrap()
            .completion,
        completed.completion
    );
    assert_eq!(
        store.agent_settings(id).unwrap().unwrap().turns[&1].completion,
        completed.completion
    );
    let conflicting = TurnInfo {
        completion: Some(TurnCompletion::Cancelled { completed_at: 201 }),
        ..Default::default()
    };
    assert!(store
        .save_turn_receipt(id, 1, &conflicting)
        .unwrap_err()
        .contains("immutable"));
    assert_eq!(
        store.shared_blocks(id).unwrap()[0]["future"],
        json!({"keep":true})
    );
}

#[test]
fn turn_receipt_sidecar_completion_cannot_invent_raw_terminal_provenance() {
    let (store, id) = fixture(vec![root("run")]);
    let mut settings = store.agent_settings(id).unwrap().unwrap();
    settings.turns.insert(1, completed());
    store
        .save_setting(
            &format!("agent:{id}"),
            &serde_json::to_string(&settings).unwrap(),
        )
        .unwrap();
    assert!(store.agent_settings(id).unwrap().unwrap().turns[&1]
        .completion
        .is_none());
    assert!(store
        .app_turn_result(id, "run")
        .unwrap()
        .unwrap()
        .completion
        .is_none());
    store.save_agent_settings(id, &settings).unwrap();
    assert!(store.shared_blocks(id).unwrap()[0]["nativeTurnCompletion"].is_null());
    assert!(store.agent_settings(id).unwrap().unwrap().turns[&1]
        .completion
        .is_none());
}

#[test]
fn turn_receipt_unknown_keys_error_for_shared_and_legacy_without_changing_data() {
    let (store, id) = fixture(vec![
        root("run"),
        json!({"id":"reply","role":"assistant","text":"Answer"}),
    ]);
    let before = store.shared_blocks(id).unwrap();
    for key in [0, 2, 999] {
        assert!(store.save_turn_receipt(id, key, &completed()).is_err());
    }
    assert_eq!(store.shared_blocks(id).unwrap(), before);
    let mut legacy = Store::open(Path::new(":memory:")).unwrap();
    let session = legacy.create("codex", "/project").unwrap();
    assert!(legacy.app_turn_result(session.id, "run").is_err());
    assert!(legacy
        .save_turn_receipt(session.id, 0, &completed())
        .is_err());
    assert!(legacy
        .save_turn_receipt(session.id, 1, &completed())
        .is_err());
    let mut transcript = crate::transcript::Transcript::default();
    transcript.begin("user");
    transcript.append("Prompt");
    transcript.begin("assistant");
    transcript.append("Answer");
    legacy.write_rows(session.id, 0, &transcript.rows).unwrap();
    legacy
        .save_turn_receipt(session.id, 1, &completed())
        .unwrap();
    assert_eq!(
        legacy.agent_settings(session.id).unwrap().unwrap().turns[&1].completion,
        completed().completion
    );
}
