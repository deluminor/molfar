use super::super::{super::*, fixtures::*};
use super::fixtures::*;
use gpui::TestAppContext;
use molfar_core::task_board::stage::lifecycle::types::StageAction;

#[gpui::test]
fn writing_stage_failure_preserves_checkout_and_never_queues_review(cx: &mut TestAppContext) {
    for behavior in ["dirty", "no-commit", "bad-output"] {
        let fixture = Fixture::new();
        let window = start(&fixture, cx);
        std::fs::write(fixture.root.join("behavior"), behavior).unwrap();
        action(&fixture, window, StageAction::ApprovePlan, cx);
        wait_until(cx, || fixture.card().run_state == "failed");
        let card = fixture.card();
        assert_eq!(card.column_id, "implement");
        let expected = match behavior {
            "dirty" => "uncommitted",
            "no-commit" => "no new commit",
            _ => "did not return",
        };
        assert!(
            card.last_error.as_deref().unwrap().contains(expected),
            "{:?}",
            card.last_error
        );
        let store = locked(&fixture.store).unwrap();
        assert!(
            store
                .board_stage_artifacts("card")
                .unwrap()
                .iter()
                .all(|meta| meta.kind != "impl_report")
        );
        if behavior == "dirty" {
            assert!(
                std::fs::read_to_string(
                    std::path::Path::new(card.worktree_path.as_deref().unwrap())
                        .join("tracked.txt")
                )
                .unwrap()
                .contains("Implement changed")
            );
        }
    }
}

#[gpui::test]
fn read_only_review_mutation_fails_without_erasing_changes(cx: &mut TestAppContext) {
    let fixture = Fixture::new();
    let window = start(&fixture, cx);
    std::fs::write(fixture.root.join("behavior"), "review-write").unwrap();
    action(&fixture, window, StageAction::ApprovePlan, cx);
    wait_until(cx, || fixture.card().run_state == "failed");
    let card = fixture.card();
    assert_eq!(card.column_id, "code_review");
    assert!(card.last_error.as_deref().unwrap().contains("read-only"));
    assert!(
        std::fs::read_to_string(
            std::path::Path::new(card.worktree_path.as_deref().unwrap()).join("tracked.txt")
        )
        .unwrap()
        .contains("Code review changed")
    );
}
