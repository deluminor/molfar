use super::super::owner::gate;
use super::fixtures::*;
use crate::task_board::stage::{
    agent::AgentStage,
    choice::settings::{SettingsPatch, StageModelConfig},
    lifecycle::types::StageAction,
};

fn rework(store: &mut crate::store::Store) {
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
}

#[test]
fn prior_cycle_review_receipt_cannot_settle_the_running_second_review() {
    let (_dir, mut store) = gate();
    approve(&mut store);
    finish(
        &mut store,
        "implement",
        AgentStage::Implement,
        "abc123",
        "one",
        REPORT,
    );
    let session = prepare(&mut store, "review", AgentStage::CodeReview, "one");
    let first = receipt(
        &mut store,
        "review",
        session,
        AgentStage::CodeReview,
        REVIEW,
        "one",
    );
    assert!(store.board_finish_stage("review", &first).unwrap().changed);
    rework(&mut store);
    finish(
        &mut store,
        "rework",
        AgentStage::Rework,
        "one",
        "two",
        REPORT,
    );
    prepare(&mut store, "review-two", AgentStage::CodeReview, "two");

    let replay = store.board_finish_stage("review", &first).unwrap();

    assert!(!replay.changed);
    assert!(!store.board_stage_is_current("review").unwrap());
    assert!(store.board_stage_result("review").unwrap().is_none());
    let snapshot = store.board_snapshot(None, false, Some("card")).unwrap();
    assert_eq!(
        (
            snapshot.cards[0].column_id.as_str(),
            snapshot.cards[0].run_state.as_str()
        ),
        ("code_review", "running")
    );
    assert!(store.board_stage_artifact("card", "review", 1).is_ok());
    assert!(store.board_stage_artifact("card", "review", 2).is_err());
}

#[test]
fn accepted_implement_run_freezes_its_model_against_later_column_edits() {
    let (_dir, mut store) = gate();
    approve(&mut store);
    prepare(&mut store, "implement", AgentStage::Implement, "abc123");

    let edited = StageModelConfig {
        harness: "claude".into(),
        model: "claude:opus".into(),
        effort: None,
        runtime_mode: "supervised".into(),
    };
    store
        .board_update_settings(&SettingsPatch::Column(AgentStage::Implement, Some(edited)))
        .unwrap();
    let run = store.board_stage_context("implement").unwrap().unwrap().run;

    assert_eq!(run.stage, "implement");
    assert_eq!(run.model, "codex:test-model");
    assert_eq!(
        (run.harness.as_str(), run.runtime_mode.as_str()),
        ("codex", "auto")
    );
}

#[test]
fn oversized_implementation_report_fails_settlement_without_advancing() {
    let (dir, mut store) = gate();
    approve(&mut store);
    let session = prepare(&mut store, "implement", AgentStage::Implement, "abc123");
    let body = "x".repeat(crate::task_board::stage::lifecycle::constants::MAX_ARTIFACT + 1);
    let text = format!("<<<MOLFAR:impl_report>>>Status: complete\n{body}<<<END:impl_report>>>");
    let output = receipt(
        &mut store,
        "implement",
        session,
        AgentStage::Implement,
        &text,
        "one",
    );

    assert!(store.board_finish_stage("implement", &output).is_err());
    let run = store.board_stage_context("implement").unwrap().unwrap().run;
    assert_eq!(run.status, "running");
    assert!(!dir.path().join("task-board/card/impl_report-1.md").exists());
    let card = &store
        .board_snapshot(None, false, Some("card"))
        .unwrap()
        .cards[0];
    assert_eq!(card.column_id, "implement");
}
