use crate::task_board::{
    detail::{
        tests::show,
        timeline_tests::{reveal_stages, run},
    },
    settings::tests::click,
};
use gpui::{TestAppContext, VisualTestContext, point, px};

#[gpui::test]
fn no_session_run_can_be_inspected_and_selected_details_survive_pointer_exit(
    cx: &mut TestAppContext,
) {
    let window = show(cx, false);
    window
        .update(cx, |board, _, cx| {
            let mut record = run("inspect", None, 2);
            record.error = Some("First error line\nSecond error line".into());
            board.snapshot.as_mut().unwrap().runs = vec![record];
            cx.notify();
        })
        .unwrap();
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    reveal_stages(visual);
    click(visual, "board-timeline-expand");
    visual.run_until_parked();
    let trigger = visual.debug_bounds("modal-run-inspect-inspect").unwrap();
    visual.simulate_mouse_move(trigger.center(), None, Default::default());
    visual.run_until_parked();
    assert!(visual.debug_bounds("board-timeline-inspection").is_some());
    click(visual, "modal-run-inspect-inspect");
    visual.run_until_parked();
    visual.simulate_mouse_move(point(px(10.), px(10.)), None, Default::default());
    visual.run_until_parked();
    assert!(visual.debug_bounds("board-timeline-selected").is_some());
    assert!(visual.debug_bounds("modal-run-open-inspect").is_none());
    window
        .update(visual, |board, window, cx| {
            let focus = board.timeline.read(cx).inspect_focus["inspect"].clone();
            window.focus(&focus, cx);
            cx.notify();
        })
        .unwrap();
    visual.run_until_parked();
    visual.simulate_keystrokes("tab");
    visual.run_until_parked();
    assert!(visual.debug_bounds("board-timeline-inspection").is_none());
    assert!(visual.debug_bounds("board-timeline-selected").is_some());

    visual.simulate_keystrokes("escape");
    visual.run_until_parked();
    assert!(visual.debug_bounds("board-timeline-selected").is_none());
}

#[gpui::test]
fn large_history_fits_small_modal_and_pending_card_switch_removes_actions(cx: &mut TestAppContext) {
    let window = show(cx, false);
    window
        .update(cx, |board, _, cx| {
            board.snapshot.as_mut().unwrap().runs = (0..32)
                .map(|index| {
                    let mut record = run(&format!("run-{index}"), Some("session"), index + 1);
                    record.error = Some("A long multiline error\n".repeat(20));
                    record
                })
                .collect();
            cx.notify();
        })
        .unwrap();
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.simulate_resize(gpui::size(px(1000.), px(1000.)));
    visual.run_until_parked();
    click(visual, "board-timeline-expand");
    visual.run_until_parked();
    visual.simulate_resize(gpui::size(px(600.), px(500.)));
    visual.run_until_parked();
    let dialog = visual.debug_bounds("board-timeline-dialog").unwrap();
    assert!(dialog.left() >= px(0.) && dialog.right() <= px(600.));
    assert!(dialog.top() >= px(0.) && dialog.bottom() <= px(500.));
    assert!(visual.debug_bounds("modal-run-open-run-31").is_some());
    visual.simulate_keystrokes("shift-tab");
    visual.run_until_parked();
    window
        .update(visual, |board, window, cx| {
            assert!(board.timeline.read(cx).inspect_focus["run-31"].is_focused(window));
            board.selected = Some("second".into());
            board.loading = false;
            board.error = Some("Replacement failed".into());
            cx.notify();
        })
        .unwrap();
    visual.run_until_parked();
    assert!(visual.debug_bounds("board-timeline-dialog").is_none());
    assert!(visual.debug_bounds("modal-run-open-run-31").is_none());
    assert!(visual.debug_bounds("board-run-open-run-0").is_none());
}
