use super::super::fixtures::{before, choice};
use crate::{
    store::Store,
    task_board::stage::{
        agent::AgentStage,
        checkout::types::{CheckoutSnapshot, RetainedCheckout},
        contracts,
        lifecycle::types::{StageAction, VerifiedStageOutput},
    },
};
use rusqlite::{params, Connection};
use serde_json::json;

pub(super) fn revision(store: &Store) -> i64 {
    store
        .board_snapshot(None, false, Some("card"))
        .unwrap()
        .cards[0]
        .updated_at
}

pub(super) fn approve(store: &mut Store) {
    store
        .board_stage_action("card", revision(store), StageAction::ApprovePlan)
        .unwrap();
}

pub(super) fn prepare(store: &mut Store, run: &str, stage: AgentStage, head: &str) -> i64 {
    let card = store.board_claim_next_stage().unwrap().unwrap();
    assert_eq!(card.column_id, stage.id());
    let context = store
        .board_accept_stage("card", card.updated_at, run, &choice())
        .unwrap();
    assert_eq!(context.run.stage, stage.id());
    store
        .board_record_stage_worktree(
            run,
            &RetainedCheckout {
                path: "/retained/card".into(),
                branch: "task/card".into(),
                base_ref: "main".into(),
                base_sha: "abc123".into(),
            },
        )
        .unwrap()
        .unwrap();
    let session = store
        .board_reserve_stage_session(run, &choice().settings, "Prompt manifest")
        .unwrap()
        .session;
    let original = store.persisted_session_id(session.id).unwrap();
    let snapshot = CheckoutSnapshot {
        head: head.into(),
        ..before()
    };
    store
        .board_record_stage_prepared(run, &snapshot, &original)
        .unwrap()
        .unwrap();
    session.id
}

pub(super) fn receipt(
    store: &mut Store,
    run: &str,
    session: i64,
    stage: AgentStage,
    text: &str,
    head: &str,
) -> VerifiedStageOutput {
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
    store.board_record_stage_submitted(run).unwrap();
    VerifiedStageOutput {
        artifacts: contracts::read_stage_output(stage, text).unwrap(),
        after: CheckoutSnapshot {
            head: head.into(),
            ..before()
        },
    }
}

pub(super) fn finish(
    store: &mut Store,
    run: &str,
    stage: AgentStage,
    before: &str,
    after: &str,
    text: &str,
) {
    let session = prepare(store, run, stage, before);
    let output = receipt(store, run, session, stage, text, after);
    assert!(store.board_finish_stage(run, &output).unwrap().changed);
}

pub(super) const REPORT: &str =
    "<<<MOLFAR:impl_report>>>Status: complete\nImplementation report<<<END:impl_report>>>";
pub(super) const REVIEW: &str = "<<<MOLFAR:review>>>Verdict: CHANGES_REQUESTED\n\n## F1 [minor] Race\nFile: src/task.rs:12\nFix race.\n\n## F2 [nit] Rename\nOptional.<<<END:review>>>";
