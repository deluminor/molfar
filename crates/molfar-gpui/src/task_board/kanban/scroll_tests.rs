use crate::task_board::{
    Board,
    tests::{card, database},
};
use gpui::{
    AppContext, Bounds, Context, Entity, Render, ScrollDelta, ScrollWheelEvent, TestAppContext,
    TouchPhase, VisualTestContext, Window, WindowBounds, WindowHandle, WindowOptions, div, point,
    prelude::*, px, size,
};
use molfar_core::task_board::{constants::BACKLOG, types::Snapshot};

struct Host {
    board: Entity<Board>,
    sidebar: bool,
}

impl Render for Host {
    fn render(&mut self, _: &mut Window, _: &mut Context<Self>) -> impl IntoElement {
        div()
            .size_full()
            .flex()
            .when(self.sidebar, |d| {
                d.child(div().w(px(224.)).h_full().flex_shrink_0())
            })
            .child(div().flex_1().min_w_0().h_full().child(self.board.clone()))
    }
}

fn open_board(cx: &mut TestAppContext) -> (Entity<Board>, WindowHandle<Host>) {
    cx.update(|cx| cx.set_reduce_motion(true));
    let board = cx.new(|cx| Board::new(database(), cx));
    board.update(cx, |board, cx| {
        board.selected = Some("first".into());
        board.drawer_open = true;
        board.finish(
            board.revision,
            Ok(Snapshot {
                cards: vec![card("first", BACKLOG)],
                selected: Some("first".into()),
                ..Default::default()
            }),
            cx,
        );
    });
    let host_board = board.clone();
    let window = cx.update(|cx| {
        cx.open_window(
            WindowOptions {
                window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                    point(px(0.), px(0.)),
                    size(px(1280.), px(720.)),
                ))),
                ..Default::default()
            },
            |_, cx| {
                cx.new(|_| Host {
                    board: host_board,
                    sidebar: true,
                })
            },
        )
        .unwrap()
    });
    (board, window)
}

#[gpui::test]
fn scrollbar_reaches_last_column_with_sidebar_and_drawer_open(cx: &mut TestAppContext) {
    let (board, window) = open_board(cx);
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    for sidebar in [true, false] {
        window
            .update(visual, |host, _, cx| {
                host.sidebar = sidebar;
                cx.notify();
            })
            .unwrap();
        visual.run_until_parked();
        let track = visual.debug_bounds("board-horizontal-scrollbar").unwrap();
        let viewport = visual.debug_bounds("board-list").unwrap();
        let drawer = visual.debug_bounds("board-detail-drawer").unwrap();
        assert!(track.right() <= drawer.left() + px(1.));
        visual.simulate_click(
            point(track.right() - px(1.), track.center().y),
            Default::default(),
        );
        visual.run_until_parked();
        let last = visual.debug_bounds("board-column-done").unwrap();
        assert!(last.right() <= viewport.right() + px(1.));
        assert!(last.right() > viewport.left());
        board.update(visual, |board, cx| {
            assert!(board.scroll.offset().x < px(0.));
            assert!(board.scroll.offset().x >= -board.scroll.max_offset().x);
            board.scroll.set_offset(point(px(0.), px(0.)));
            cx.notify();
        });
    }
}

#[gpui::test]
fn vertical_wheel_never_scrolls_board_sideways(cx: &mut TestAppContext) {
    let (board, window) = open_board(cx);
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    let position = visual.debug_bounds("board-list").unwrap().center();
    let wheel = |delta| ScrollWheelEvent {
        position,
        delta: ScrollDelta::Lines(delta),
        modifiers: Default::default(),
        touch_phase: TouchPhase::Moved,
    };

    visual.simulate_event(wheel(point(0., -3.)));
    visual.run_until_parked();
    board.update(visual, |board, _| {
        assert!(board.scroll.max_offset().x > px(0.));
        assert_eq!(board.scroll.offset().x, px(0.));
    });

    visual.simulate_event(wheel(point(-3., 0.)));
    visual.run_until_parked();
    board.update(visual, |board, _| assert!(board.scroll.offset().x < px(0.)));
}
