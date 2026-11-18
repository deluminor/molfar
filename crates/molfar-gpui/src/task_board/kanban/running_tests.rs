use crate::{
    pulse::TICK,
    task_board::tests::{card, window},
};
use gpui::{TestAppContext, VisualTestContext};
use molfar_core::task_board::{
    constants::{BACKLOG, IMPLEMENT},
    stage::lifecycle::constants::{FAILED, RUNNING},
    types::Snapshot,
};

#[gpui::test]
fn only_running_cards_get_a_spinner_and_no_card_animates_its_border(cx: &mut TestAppContext) {
    let window = window(cx);
    let mut running = card("live", BACKLOG);
    running.run_state = RUNNING.into();
    let mut failed = card("broken", BACKLOG);
    failed.run_state = FAILED.into();
    window
        .update(cx, |board, _, cx| {
            board.finish(
                board.revision,
                Ok(Snapshot {
                    cards: vec![running, failed],
                    ..Default::default()
                }),
                cx,
            );
        })
        .unwrap();
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();

    assert!(visual.debug_bounds("board-card-live").is_some());
    assert!(visual.debug_bounds("board-card-running-live").is_none());
    assert!(visual.debug_bounds("board-card-spinner-live").is_some());
    assert!(visual.debug_bounds("board-card-running-broken").is_none());
    assert!(visual.debug_bounds("board-card-spinner-broken").is_none());
}

#[gpui::test]
fn a_running_card_ticks_without_rebuilding_the_open_drawer(cx: &mut TestAppContext) {
    let window = window(cx);
    cx.update(|cx| cx.set_reduce_motion(false));
    window
        .update(cx, |board, _, cx| {
            board.selected = Some("live".into());
            board.drawer_open = true;
            board.finish(
                board.revision,
                Ok(Snapshot {
                    cards: vec![card("live", BACKLOG)],
                    selected: Some("live".into()),
                    ..Default::default()
                }),
                cx,
            );
        })
        .unwrap();
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    assert!(visual.debug_bounds("board-detail").is_some());
    let before = window.update(visual, |board, _, _| board.renders).unwrap();
    gpui::frame_stats::enable();
    gpui::frame_stats::take();

    visual.executor().advance_clock(TICK * 8);
    visual.run_until_parked();

    let stats = gpui::frame_stats::take();
    eprintln!("Running card with drawer, eight ticks: {stats:?}");
    assert_eq!(stats.views_rendered, 0, "{stats:?}");
    assert_eq!(stats.counters, [("animated-path-steps", 4)]);
    assert_eq!(
        window.update(visual, |board, _, _| board.renders).unwrap(),
        before
    );

    window
        .update(visual, |board, _, cx| {
            board.snapshot.as_mut().unwrap().cards[0].column_id = IMPLEMENT.into();
            cx.notify();
        })
        .unwrap();
    visual.run_until_parked();
    visual.executor().advance_clock(TICK * 2);
    visual.run_until_parked();
    visual.update(|window, cx| {
        assert!(
            !window.has_animated_paths(),
            "the clipped spinner has no paint slot"
        );
        assert!(!crate::pulse::running(cx));
    });
}
