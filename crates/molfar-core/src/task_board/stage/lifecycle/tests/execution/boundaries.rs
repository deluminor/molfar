use super::{super::owner::gate, fixtures::*};
use crate::task_board::stage::{
    agent::AgentStage,
    lifecycle::types::{FailureStatus, StageAction},
};
use rusqlite::Connection;

#[test]
fn writing_stage_requires_commit_and_exact_output_and_partial_save_is_retryable() {
    let (dir, mut store) = gate();
    approve(&mut store);
    let session = prepare(&mut store, "implement", AgentStage::Implement, "abc123");
    let mut output = receipt(
        &mut store,
        "implement",
        session,
        AgentStage::Implement,
        REPORT,
        "abc123",
    );
    assert!(store
        .board_finish_stage("implement", &output)
        .unwrap_err()
        .contains("no new commit"));
    output.after.head = "committed".into();
    output.after.porcelain = " M file".into();
    assert!(store
        .board_finish_stage("implement", &output)
        .unwrap_err()
        .contains("uncommitted"));
    output.after.porcelain.clear();
    output.artifacts[0].body = "forged".into();
    assert!(store
        .board_finish_stage("implement", &output)
        .unwrap_err()
        .contains("differ"));
    output.artifacts[0].body = "Status: complete\nImplementation report".into();
    let conn = Connection::open(store.database_path()).unwrap();
    conn.execute_batch("CREATE TRIGGER fail_report BEFORE INSERT ON task_board_artifacts WHEN NEW.kind='impl_report' BEGIN SELECT RAISE(ABORT,'injected report failure'); END;").unwrap();
    assert!(store
        .board_finish_stage("implement", &output)
        .unwrap_err()
        .contains("injected"));
    assert_eq!(
        store
            .board_stage_context("implement")
            .unwrap()
            .unwrap()
            .run
            .status,
        "running"
    );
    assert!(dir.path().join("task-board/card/impl_report-1.md").exists());
    conn.execute_batch("DROP TRIGGER fail_report;").unwrap();
    assert!(
        store
            .board_finish_stage("implement", &output)
            .unwrap()
            .changed
    );
    assert!(
        !store
            .board_finish_stage("implement", &output)
            .unwrap()
            .changed
    );
}

#[test]
fn read_only_review_mutation_and_stale_cancelled_completion_cannot_advance() {
    let (_dir, mut store) = gate();
    approve(&mut store);
    finish(
        &mut store,
        "implement",
        AgentStage::Implement,
        "abc123",
        "committed",
        REPORT,
    );
    let session = prepare(&mut store, "review", AgentStage::CodeReview, "committed");
    let mut output = receipt(
        &mut store,
        "review",
        session,
        AgentStage::CodeReview,
        REVIEW,
        "changed",
    );
    assert!(store.board_finish_stage("review", &output).is_err());
    output.after.head = "committed".into();
    store
        .board_stage_action("card", revision(&store), StageAction::Cancel)
        .unwrap();
    assert!(!store.board_finish_stage("review", &output).unwrap().changed);
    store
        .board_stage_action("card", revision(&store), StageAction::Retry(None))
        .unwrap();
    assert!(!store.board_finish_stage("review", &output).unwrap().changed);
    let card = store.board_claim_next_stage().unwrap().unwrap();
    let context = store
        .board_accept_stage(
            "card",
            card.updated_at,
            "new-review",
            &crate::task_board::stage::lifecycle::tests::fixtures::choice(),
        )
        .unwrap();
    assert_eq!(context.run.attempt, 2);
    assert!(
        !store
            .board_fail_stage("review", FailureStatus::Failed, "stale")
            .unwrap()
            .changed
    );
    assert!(store.board_stage_is_current("new-review").unwrap());
}

#[test]
fn first_failed_review_back_cannot_strand_card_without_a_readable_review() {
    let (_dir, mut store) = gate();
    approve(&mut store);
    finish(
        &mut store,
        "implement",
        AgentStage::Implement,
        "abc123",
        "committed",
        REPORT,
    );
    prepare(&mut store, "review", AgentStage::CodeReview, "committed");
    store
        .board_fail_stage("review", FailureStatus::Failed, "provider failed")
        .unwrap();
    let old = revision(&store);
    let result = store.board_stage_action("card", old, StageAction::Back);
    assert!(
        result.is_err(),
        "Back must preserve the runnable Retry path when no completed review exists"
    );
    assert_eq!(revision(&store), old);
    let next = store
        .board_stage_action("card", old, StageAction::Retry(None))
        .unwrap();
    assert_eq!(next.card.column_id, "code_review");
    assert_eq!(next.card.run_state, "queued");
}

#[test]
fn failed_review_back_with_existing_readable_review_preserves_owner_rework() {
    let (_dir, mut store) = gate();
    approve(&mut store);
    finish(
        &mut store,
        "implement",
        AgentStage::Implement,
        "abc123",
        "committed",
        REPORT,
    );
    finish(
        &mut store,
        "review",
        AgentStage::CodeReview,
        "committed",
        "committed",
        REVIEW,
    );
    let review = store.board_final_review("card").unwrap();
    store
        .board_stage_action(
            "card",
            review.card.updated_at,
            StageAction::Rework {
                findings: vec!["F1".into()],
                note: String::new(),
                review_version: review.version,
            },
        )
        .unwrap();
    finish(
        &mut store,
        "rework",
        AgentStage::Rework,
        "committed",
        "reworked",
        REPORT,
    );
    prepare(&mut store, "review-two", AgentStage::CodeReview, "reworked");
    store
        .board_fail_stage("review-two", FailureStatus::Failed, "provider failed")
        .unwrap();
    let result = store
        .board_stage_action("card", revision(&store), StageAction::Back)
        .unwrap();
    assert_eq!(result.card.column_id, "final_review");
    assert_eq!(
        store.board_final_review("card").unwrap().version,
        review.version
    );
}
