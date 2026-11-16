mod checks;
mod delivery;
mod failures;
mod fixtures;
mod recovery;
mod reuse;
mod usage;
use super::{super::*, fixtures::Fixture};
use fixtures::*;
use gpui::TestAppContext;
use molfar_core::task_board::stage::{checkout, lifecycle::types::StageAction};
use std::path::Path;

#[gpui::test]
fn native_approval_implementation_review_rework_pipeline_uses_isolated_committed_checkout(
    cx: &mut TestAppContext,
) {
    let fixture = Fixture::new();
    let original = checkout::snapshot(Path::new(&fixture.project)).unwrap();
    let window = start(&fixture, cx);
    action(&fixture, window, StageAction::ApprovePlan, cx);
    gate(&fixture, "final_review", cx);
    let review = locked(&fixture.store)
        .unwrap()
        .board_final_review("card")
        .unwrap();
    assert_eq!(review.review.findings.len(), 2);
    let first_head =
        checkout::snapshot(Path::new(fixture.card().worktree_path.as_deref().unwrap()))
            .unwrap()
            .head;
    action(
        &fixture,
        window,
        StageAction::Rework {
            findings: vec!["F1".into()],
            note: "Only race".into(),
            review_version: review.version,
        },
        cx,
    );
    gate(&fixture, "final_review", cx);
    assert_eq!(fixture.card().rework_cycle, 1);
    let worktree = fixture.card().worktree_path.unwrap();
    assert_ne!(
        checkout::snapshot(Path::new(&worktree)).unwrap().head,
        first_head
    );
    let store = locked(&fixture.store).unwrap();
    let snapshot = store.board_snapshot(None, false, Some("card")).unwrap();
    assert_eq!(
        snapshot
            .runs
            .iter()
            .map(|run| run.stage.as_str())
            .collect::<Vec<_>>(),
        vec!["grill", "implement", "code_review", "rework", "code_review"]
    );
    assert!(
        snapshot
            .runs
            .iter()
            .all(|run| run.status == "succeeded" && run.dispatch == "settled")
    );
    assert_eq!(
        snapshot
            .runs
            .iter()
            .filter(|run| run.stage == "code_review")
            .map(|run| run.attempt)
            .collect::<Vec<_>>(),
        vec![1, 2]
    );
    assert!(
        store
            .board_stage_artifact("card", "pr_description", 1)
            .unwrap()
            .contains("Fixture PR")
    );
    let brief = store
        .board_stage_artifact("card", "rework_brief", 1)
        .unwrap();
    assert!(brief.contains("Fix this race."));
    assert!(!brief.contains("Optional rename"));
    assert_eq!(
        checkout::snapshot(Path::new(&fixture.project)).unwrap(),
        original
    );
    assert_eq!(
        std::fs::read_to_string(fixture.root.join("submissions"))
            .unwrap()
            .lines()
            .count(),
        5
    );
}
