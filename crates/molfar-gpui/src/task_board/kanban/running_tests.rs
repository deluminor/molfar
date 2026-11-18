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
fn a_running_card_redraws_the_board_at_half_the_clock_rate(cx: &mut TestAppContext) {
    let window = window(cx);
    cx.update(|cx| cx.set_reduce_motion(false));
    window
        .update(cx, |board, _, cx| {
            board.selected = Some("live".into());
            board.drawer_open = true;
            board.finish(
                board.revision,
                Ok(Snapshot {
                    cards: vec![card("live", IMPLEMENT)],
                    selected: Some("live".into()),
                    ..Default::default()
                }),
                cx,
            );
        })
        .unwrap();
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    let before = window.update(visual, |board, _, _| board.renders).unwrap();

    visual.executor().advance_clock(TICK * 8);
    visual.run_until_parked();

    let ticks = window.update(visual, |board, _, _| board.renders).unwrap() - before;
    assert!(ticks >= 1, "the spinner still turns");
    assert!(ticks <= 4 + 1, "{ticks} renders in 8 ticks");
}
