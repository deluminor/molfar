use crate::task_board::{
    Board,
    tests::{card, window},
};
use gpui::{
    ScrollDelta, ScrollWheelEvent, TestAppContext, VisualTestContext, WindowHandle, point, px,
};
use molfar_core::task_board::{
    constants::{BACKLOG, IDLE},
    types::Snapshot,
};

fn open_long_card(cx: &mut TestAppContext) -> WindowHandle<Board> {
    let window = window(cx);
    window
        .update(cx, |board, _, cx| {
            let mut first = card("first", BACKLOG);
            first.run_state = IDLE.into();
            first.description = "# Heading\n\nA paragraph of task text.\n\n".repeat(40);
            first.acceptance_criteria = "- Check behavior\n".repeat(40);
            board.selected = Some("first".into());
            board.drawer_open = true;
            board.finish(
                board.revision,
                Ok(Snapshot {
                    cards: vec![first, card("second", BACKLOG)],
                    selected: Some("first".into()),
                    ..Default::default()
                }),
                cx,
            );
        })
        .unwrap();
    window
}

fn pane_renders(window: WindowHandle<Board>, cx: &mut VisualTestContext) -> (usize, usize) {
    window
        .update(cx, |board, _, cx| {
            let detail = board.detail_pane.read(cx).renders;
            let columns = board
                .column_panes
                .values()
                .map(|pane| pane.read(cx).renders)
                .sum();
            (detail, columns)
        })
        .unwrap()
}

#[gpui::test]
fn scrolling_the_open_card_renders_only_the_detail_pane(cx: &mut TestAppContext) {
    let window = open_long_card(cx);
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    let (detail_before, columns_before) = pane_renders(window, visual);
    let toggle_before = visual.debug_bounds("board-description-toggle").unwrap();
    let detail = visual.debug_bounds("board-detail").unwrap();

    visual.simulate_event(ScrollWheelEvent {
        position: detail.center(),
        delta: ScrollDelta::Pixels(point(px(0.), px(-240.))),
        ..Default::default()
    });
    visual.run_until_parked();

    let (detail_after, columns_after) = pane_renders(window, visual);
    let toggle_after = visual.debug_bounds("board-description-toggle").unwrap();
    assert!(toggle_after.origin.y < toggle_before.origin.y);
    assert!(detail_after > detail_before);
    assert_eq!(columns_after, columns_before);
}

#[gpui::test]
fn a_board_change_still_refreshes_the_cached_panes(cx: &mut TestAppContext) {
    let window = open_long_card(cx);
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    let (detail_before, columns_before) = pane_renders(window, visual);
    assert!(visual.debug_bounds("board-card-second").is_some());

    window
        .update(visual, |board, _, cx| {
            board.snapshot.as_mut().unwrap().cards.pop();
            cx.notify();
        })
        .unwrap();
    visual.run_until_parked();

    let (detail_after, columns_after) = pane_renders(window, visual);
    assert!(detail_after > detail_before);
    assert!(columns_after > columns_before);
    assert!(visual.debug_bounds("board-card-second").is_none());
}

#[gpui::test]
#[ignore = "benchmark: cargo test --bin molfar-native board_detail_scroll_frame_time -- --ignored --nocapture"]
fn board_detail_scroll_frame_time(cx: &mut TestAppContext) {
    const FRAMES: usize = 40;
    let window = open_long_card(cx);
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    let detail = visual.debug_bounds("board-detail").unwrap();

    let start = std::time::Instant::now();
    for _ in 0..FRAMES {
        visual.simulate_event(ScrollWheelEvent {
            position: detail.center(),
            delta: ScrollDelta::Pixels(point(px(0.), px(-24.))),
            ..Default::default()
        });
        visual.run_until_parked();
    }
    let ms = start.elapsed().as_secs_f64() * 1000. / FRAMES as f64;
    eprintln!("board detail scroll {ms:.2} ms/frame");
}
