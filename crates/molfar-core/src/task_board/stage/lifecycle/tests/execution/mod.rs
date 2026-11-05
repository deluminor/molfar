mod boundaries;
mod fixtures;
mod guards;
use super::owner::gate;
use crate::task_board::stage::{agent::AgentStage, lifecycle::types::StageAction};
use fixtures::*;

#[test]
fn approval_implementation_review_and_selected_rework_form_a_durable_cycle() {
    let (_dir, mut store) = gate();
    let old = revision(&store);
    approve(&mut store);
    assert!(store
        .board_stage_action("card", old, StageAction::ApprovePlan)
        .unwrap_err()
        .starts_with("conflict:"));
    let inputs = store.board_stage_inputs("card").unwrap();
    assert_eq!(
        inputs
            .iter()
            .map(|input| input.kind.as_str())
            .collect::<Vec<_>>(),
        vec!["task", "spec", "plan"]
    );
    finish(
        &mut store,
        "implement",
        AgentStage::Implement,
        "abc123",
        "implementation",
        REPORT,
    );
    let inputs = store.board_stage_inputs("card").unwrap();
    assert_eq!(inputs.last().unwrap().kind, "impl_report");
    finish(
        &mut store,
        "review",
        AgentStage::CodeReview,
        "implementation",
        "implementation",
        REVIEW,
    );
    let review = store.board_final_review("card").unwrap();
    assert_eq!(review.card.column_id, "final_review");
    assert_eq!(review.card.run_state, "idle");
    assert_eq!(review.review.findings.len(), 2);
    store
        .board_stage_action(
            "card",
            review.card.updated_at,
            StageAction::Rework {
                findings: vec!["F1".into()],
                note: "Only race".into(),
                review_version: review.version,
            },
        )
        .unwrap();
    let card = &store
        .board_snapshot(None, false, Some("card"))
        .unwrap()
        .cards[0];
    assert_eq!(card.rework_cycle, 1);
    let inputs = store.board_stage_inputs("card").unwrap();
    let brief = inputs
        .iter()
        .find(|input| input.kind == "rework_brief")
        .unwrap();
    assert!(brief.body.contains("Fix race."));
    assert!(!brief.body.contains("Rename"));
    assert!(brief.body.contains("Only race"));
    finish(
        &mut store,
        "rework",
        AgentStage::Rework,
        "implementation",
        "reworked",
        REPORT,
    );
    finish(
        &mut store,
        "review-two",
        AgentStage::CodeReview,
        "reworked",
        "reworked",
        "<<<MOLFAR:review>>>Verdict: APPROVE<<<END:review>>>",
    );
    let final_review = store.board_final_review("card").unwrap();
    assert_eq!(final_review.version, 2);
    assert!(final_review.review.findings.is_empty());
    assert!(store
        .board_stage_artifact("card", "review", 1)
        .unwrap()
        .contains("Fix race."));
    let snapshot = store.board_snapshot(None, false, Some("card")).unwrap();
    assert_eq!(snapshot.runs.len(), 5);
    assert!(snapshot
        .runs
        .iter()
        .all(|run| run.status == "succeeded" && run.dispatch == "settled"));
    assert_eq!(
        snapshot
            .runs
            .iter()
            .filter(|run| run.stage == "code_review")
            .map(|run| run.attempt)
            .collect::<Vec<_>>(),
        vec![1, 2]
    );
    assert_eq!(snapshot.cards[0].column_id, "final_review");
}

#[test]
fn rework_refuses_stale_review_empty_selection_and_preserves_versions() {
    let (_dir, mut store) = gate();
    approve(&mut store);
    finish(
        &mut store,
        "implement",
        AgentStage::Implement,
        "abc123",
        "implementation",
        REPORT,
    );
    finish(
        &mut store,
        "review",
        AgentStage::CodeReview,
        "implementation",
        "implementation",
        REVIEW,
    );
    let review = store.board_final_review("card").unwrap();
    for (findings, note, version) in [
        (vec!["F9".into()], "", review.version),
        (vec!["F1".into()], "", review.version + 1),
    ] {
        assert!(store
            .board_stage_action(
                "card",
                review.card.updated_at,
                StageAction::Rework {
                    findings,
                    note: note.into(),
                    review_version: version
                }
            )
            .is_err());
    }
    assert_eq!(revision(&store), review.card.updated_at);
    assert!(store
        .board_stage_artifacts("card")
        .unwrap()
        .iter()
        .all(|meta| meta.kind != "rework_brief"));
    store
        .board_stage_action(
            "card",
            review.card.updated_at,
            StageAction::Rework {
                findings: vec![],
                note: "Note only".into(),
                review_version: review.version,
            },
        )
        .unwrap();
    assert_eq!(
        store
            .board_stage_artifact("card", "rework_brief", 1)
            .unwrap(),
        "## Note\n\nNote only"
    );
}
