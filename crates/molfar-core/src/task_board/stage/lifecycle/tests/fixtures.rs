use crate::{
    agent::{AccessMode, Settings},
    provider::Kind,
    store::Store,
    task_board::stage::{
        checkout::types::{CheckoutSnapshot, RetainedCheckout},
        choice::types::ResolvedStageChoice,
        lifecycle::types::{StageAction, StageContext, VerifiedStageOutput},
    },
};
use rusqlite::{params, Connection};
use serde_json::json;

pub(super) fn fixture() -> (tempfile::TempDir, Store) {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("molfar.db");
    let store = Store::open_desktop(&path).unwrap();
    Connection::open(path).unwrap().execute("INSERT INTO task_board_cards(id,number,project_cwd,title,description,column_id,run_state,position,created_at,updated_at) VALUES('card',1,'/project','A card','Description','backlog','idle',1,1,1)",[]).unwrap();
    (directory, store)
}

pub(super) fn choice() -> ResolvedStageChoice {
    let settings = Settings {
        access: AccessMode::Auto,
        model: Some("test-model".into()),
        ..Default::default()
    };
    ResolvedStageChoice {
        kind: Kind::Codex,
        model: "test-model".into(),
        settings,
        runtime_mode: "auto".into(),
        skills: vec![],
        warnings: vec![],
        model_settings: json!({}),
    }
}

pub(super) fn accept(store: &mut Store, run: &str) -> StageContext {
    let card = store
        .board_snapshot(None, false, None)
        .unwrap()
        .cards
        .into_iter()
        .find(|c| c.id == "card")
        .unwrap();
    let action = if card.column_id == "backlog" {
        StageAction::Start
    } else {
        StageAction::Retry(None)
    };
    if card.run_state != "queued" {
        store
            .board_stage_action("card", card.updated_at, action)
            .unwrap();
    }
    let card = store.board_claim_next_stage().unwrap().unwrap();
    store
        .board_accept_stage("card", card.updated_at, run, &choice())
        .unwrap()
}

pub(super) fn before() -> CheckoutSnapshot {
    CheckoutSnapshot {
        head: "abc123".into(),
        porcelain: "".into(),
        fingerprint: "same-bytes".into(),
    }
}

pub(super) fn prepare(store: &mut Store, run: &str) -> i64 {
    accept(store, run);
    let tree = RetainedCheckout {
        path: "/retained/card".into(),
        branch: "task/card".into(),
        base_ref: "main".into(),
        base_sha: "abc123".into(),
    };
    store
        .board_record_stage_worktree(run, &tree)
        .unwrap()
        .unwrap();
    let session = store
        .board_reserve_stage_session(run, &choice().settings, "Prompt manifest")
        .unwrap()
        .session;
    let original = store.persisted_session_id(session.id).unwrap();
    store
        .board_record_stage_prepared(run, &before(), &original)
        .unwrap()
        .unwrap();
    session.id
}

pub(super) fn complete(store: &mut Store, run: &str) -> VerifiedStageOutput {
    complete_with_text(store, run, "<<<MOLFAR:spec>>>\nA specification\n<<<END:spec>>>\n<<<MOLFAR:plan>>>\nA plan\n<<<END:plan>>>")
}

pub(super) fn complete_with_text(store: &mut Store, run: &str, text: &str) -> VerifiedStageOutput {
    let session = prepare(store, run);
    let blocks = json!([
        {"id":"root","role":"user","text":"Prompt","startedAt":100,"appRequestId":format!("app-prompt-{}",crate::familiar::files::content_hash(run)),"nativeTurnCompletion":{"status":"succeeded","completed_at":200}},
        {"id":"answer","role":"assistant","text":text}
    ]);
    let original = store.persisted_session_id(session).unwrap();
    Connection::open(store.database_path())
        .unwrap()
        .execute(
            "UPDATE sessions SET blocks_json=?2 WHERE id=?1",
            params![original, blocks.to_string()],
        )
        .unwrap();
    assert!(store.board_record_stage_submitted(run).unwrap());
    VerifiedStageOutput {
        artifacts: crate::task_board::stage::contracts::read_grill_output(text).unwrap(),
        after: before(),
    }
}
