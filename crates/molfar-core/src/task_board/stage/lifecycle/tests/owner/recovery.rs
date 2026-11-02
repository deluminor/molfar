use super::{
    super::fixtures::{choice, complete, complete_with_text},
    gate,
};
use crate::{store::Store, task_board::stage::lifecycle::types::StageAction};
use rusqlite::Connection;

#[test]
fn owner_artifact_metadata_failure_rolls_back_card_and_retry_reuses_immutable_orphan() {
    let (dir, mut store) = gate();
    let revision = store.board_owner_review("card").unwrap().card.updated_at;
    let conn = Connection::open(store.database_path()).unwrap();
    conn.execute_batch("CREATE TRIGGER fail_owner BEFORE INSERT ON task_board_artifacts WHEN NEW.source='user' BEGIN SELECT RAISE(ABORT,'injected owner failure'); END;").unwrap();
    assert!(store
        .board_stage_action(
            "card",
            revision,
            StageAction::RequestChanges("Follow up".into())
        )
        .unwrap_err()
        .contains("injected"));
    assert_eq!(
        store.board_owner_review("card").unwrap().card.updated_at,
        revision
    );
    assert!(dir.path().join("task-board/card/answers-1.md").exists());
    conn.execute_batch("DROP TRIGGER fail_owner").unwrap();
    store
        .board_stage_action(
            "card",
            revision,
            StageAction::RequestChanges("Follow up".into()),
        )
        .unwrap();
    let artifacts = store.board_stage_artifacts("card").unwrap();
    assert_eq!(
        artifacts
            .iter()
            .filter(|meta| meta.kind == "answers")
            .count(),
        1
    );
    assert!(!dir.path().join("task-board/card/answers-2.md").exists());
    assert!(store
        .board_stage_action(
            "card",
            revision,
            StageAction::RequestChanges("Follow up".into())
        )
        .is_err());
}

#[test]
fn owner_round_two_claim_survives_restart_and_stale_first_receipt_cannot_settle_it() {
    let (dir, mut store) = gate();
    let review = store.board_owner_review("card").unwrap();
    store
        .board_stage_action(
            "card",
            review.card.updated_at,
            StageAction::EditPlan("User edited".into()),
        )
        .unwrap();
    let review = store.board_owner_review("card").unwrap();
    store
        .board_stage_action(
            "card",
            review.card.updated_at,
            StageAction::RequestChanges("Use this scope".into()),
        )
        .unwrap();
    drop(store);
    let mut store = Store::open_desktop(&dir.path().join("molfar.db")).unwrap();
    let inputs = store.board_grill_inputs("card").unwrap();
    assert_eq!(
        inputs.iter().map(|i| i.kind.as_str()).collect::<Vec<_>>(),
        ["task", "spec", "plan", "answers", "questions"]
    );
    assert_eq!(
        inputs.iter().find(|i| i.kind == "plan").unwrap().body,
        "User edited"
    );
    let output = complete(&mut store, "second");
    assert!(store.board_grill_is_current("second").unwrap());
    assert!(!store.board_grill_is_current("first").unwrap());
    assert!(!store.board_finish_grill("first", &output).unwrap().changed);
    let effect = store.board_finish_grill("second", &output).unwrap();
    assert_eq!(effect.card.unwrap().grill_round, 2);
    let review = store.board_owner_review("card").unwrap();
    assert!(review.questions.is_empty());
    assert_eq!(review.plan, "A plan");
    assert_eq!(
        store.board_stage_artifact("card", "plan", 2).unwrap(),
        "User edited"
    );
}

#[test]
fn owner_cancel_and_retry_in_round_two_keep_round_and_refuse_stale_receipts() {
    let (_dir, mut store) = gate();
    let review = store.board_owner_review("card").unwrap();
    store
        .board_stage_action(
            "card",
            review.card.updated_at,
            StageAction::RequestChanges("Again".into()),
        )
        .unwrap();
    let claimed = store.board_claim_next_grill().unwrap().unwrap();
    let context = store
        .board_accept_grill("card", claimed.updated_at, "cancelled-second", &choice())
        .unwrap();
    store
        .board_stage_action("card", context.card.updated_at, StageAction::Cancel)
        .unwrap();
    let card = store
        .board_snapshot(None, false, None)
        .unwrap()
        .cards
        .remove(0);
    assert_eq!(card.grill_round, 2);
    store
        .board_stage_action("card", card.updated_at, StageAction::Retry(None))
        .unwrap();
    let output = complete(&mut store, "retried-second");
    assert!(
        !store
            .board_finish_grill("cancelled-second", &output)
            .unwrap()
            .changed
    );
    assert!(
        store
            .board_finish_grill("retried-second", &output)
            .unwrap()
            .changed
    );
    assert_eq!(
        store.board_owner_review("card").unwrap().card.grill_round,
        2
    );
}

#[test]
fn owner_handoff_omits_old_questions_and_missing_metadata_falls_back_but_bad_file_errors() {
    let (dir, mut store) = gate();
    let review = store.board_owner_review("card").unwrap();
    store
        .board_stage_action(
            "card",
            review.card.updated_at,
            StageAction::RequestChanges("Again".into()),
        )
        .unwrap();
    let output = complete_with_text(
        &mut store,
        "second",
        "<<<MOLFAR:spec>>>Updated<<<END:spec>>><<<MOLFAR:plan>>>Updated<<<END:plan>>>",
    );
    store.board_finish_grill("second", &output).unwrap();
    let review = store.board_owner_review("card").unwrap();
    store
        .board_stage_action(
            "card",
            review.card.updated_at,
            StageAction::RequestChanges("Final".into()),
        )
        .unwrap();
    let inputs = store.board_grill_inputs("card").unwrap();
    assert_eq!(inputs.len(), 4);
    assert!(!inputs.iter().any(|input| input.kind == "questions"));
    std::fs::remove_file(dir.path().join("task-board/card/answers-2.md")).unwrap();
    assert!(store.board_grill_inputs("card").is_err());
    let conn = Connection::open(store.database_path()).unwrap();
    conn.execute("DELETE FROM task_board_artifacts WHERE kind='spec'", [])
        .unwrap();
    assert!(store.board_grill_inputs("card").is_err());
    conn.execute("DELETE FROM task_board_artifacts WHERE kind='answers'", [])
        .unwrap();
    assert_eq!(store.board_grill_inputs("card").unwrap().len(), 1);
    std::fs::write(dir.path().join("task-board/card/plan-2.md"), " ").unwrap();
    assert!(store.board_grill_inputs("card").is_err());
}

#[test]
fn submitted_round_two_reopens_with_exact_receipt_and_settles_only_once() {
    let (dir, mut store) = gate();
    let revision = store.board_owner_review("card").unwrap().card.updated_at;
    store
        .board_stage_action(
            "card",
            revision,
            StageAction::RequestChanges("After restart".into()),
        )
        .unwrap();
    let output = complete(&mut store, "persisted-second");
    drop(store);
    let mut store = Store::open_desktop(&dir.path().join("molfar.db")).unwrap();
    let context = store
        .board_grill_context("persisted-second")
        .unwrap()
        .unwrap();
    assert_eq!(context.card.grill_round, 2);
    assert_eq!(context.run.dispatch, "turn_submitted");
    assert!(store
        .board_grill_result("persisted-second")
        .unwrap()
        .is_some());
    assert!(
        store
            .board_finish_grill("persisted-second", &output)
            .unwrap()
            .changed
    );
    assert!(
        !store
            .board_finish_grill("persisted-second", &output)
            .unwrap()
            .changed
    );
    assert_eq!(
        store.board_owner_review("card").unwrap().card.grill_round,
        2
    );
}
