use super::super::tests::{card, window};
use super::tests::run;
use gpui::{TestAppContext, VisualTestContext};
use molfar_core::task_board::types::Snapshot;

#[gpui::test]
fn plan_approval_footer_leads_with_approve_and_keeps_reject_apart(cx: &mut TestAppContext) {
    let window = window(cx);
    let mut gate = card("card", "plan_approval");
    gate.run_state = "idle".into();
    window
        .update(cx, |board, _, cx| {
            let snapshot = Snapshot {
                cards: vec![gate],
                runs: vec![run("card", "session")],
                selected: Some("card".into()),
                ..Default::default()
            };
            board.drawer_open = true;
            board.finish(board.revision, Ok(snapshot), cx);
        })
        .unwrap();
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    let mut bounds = |selector: &'static str| {
        visual
            .debug_bounds(selector)
            .unwrap_or_else(|| panic!("{selector}"))
    };

    let footer = bounds("board-stage-footer");
    let approve = bounds("board-stage-action");
    let review = bounds("board-owner-review");
    let session = bounds("board-open-stage-session");
    let edit = bounds("board-owner-edit-plan");
    let reject = bounds("board-reject");

    assert_eq!(approve.top(), review.top());
    assert!(approve.size.width > review.size.width);
    assert!(session.top() > approve.bottom());
    assert_eq!(session.top(), edit.top());
    assert!(reject.left() > edit.right());
    assert!(footer.right() - reject.right() < gpui::px(1.));
}
