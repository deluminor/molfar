use super::{
    Mode,
    tests::{data, ready},
};
use gpui::{TestAppContext, VisualTestContext};

#[gpui::test]
fn conflicting_owner_draft_survives_reload_failure_and_is_discarded_only_on_success(
    cx: &mut TestAppContext,
) {
    let window = ready(cx, Mode::Plan);
    window
        .update(cx, |board, _, cx| {
            board
                .review
                .as_ref()
                .unwrap()
                .plan
                .update(cx, |input, cx| input.set_text("Unsaved draft".into(), cx));
            board.submit_owner_review(false, cx);
            board.finish_update(
                Some("conflict: the card changed; reload and try again".into()),
                cx,
            );
            let panel = board.review.as_ref().unwrap();
            assert!(panel.reload_required);
            assert!(!panel.can_submit(false, cx));
            assert_eq!(panel.plan.read(cx).content.as_ref(), "Unsaved draft");
        })
        .unwrap();
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    assert!(visual.debug_bounds("board-owner-reload").is_some());
    window
        .update(visual, |board, _, cx| board.load_owner_review(cx))
        .unwrap();
    visual.run_until_parked();
    window
        .update(visual, |board, window, cx| {
            let panel = board.review.as_ref().unwrap();
            assert!(panel.reload_required);
            assert!(panel.error.is_some());
            assert_eq!(panel.plan.read(cx).content.as_ref(), "Unsaved draft");
            assert!(!panel.can_submit(false, cx));
            let mut latest = data();
            latest.card.updated_at = 100;
            latest.plan = "Other writer's plan".into();
            board.finish_owner_load(board.review_revision, Ok(latest.into()), window, cx);
            let panel = board.review.as_ref().unwrap();
            assert!(!panel.reload_required);
            assert!(panel.error.is_none());
            assert_eq!(panel.plan.read(cx).content.as_ref(), "Other writer's plan");
            assert_eq!(panel.data.as_ref().unwrap().card().updated_at, 100);
            assert!(!panel.can_submit(false, cx));
        })
        .unwrap();
}
