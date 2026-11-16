use super::look::edge_scroll_step;
use crate::task_board::{
    Board, Event,
    tests::{card, window},
};
use gpui::{MouseButton, TestAppContext, VisualTestContext, WindowHandle, point, px};
use molfar_core::task_board::{
    stage::lifecycle::types::StageAction,
    types::{Card, Snapshot},
};
use std::{cell::RefCell, rc::Rc};

type Actions = Rc<RefCell<Vec<StageAction>>>;

fn show(cx: &mut TestAppContext, cards: Vec<Card>) -> (WindowHandle<Board>, Actions) {
    let window = window(cx);
    let actions: Actions = Rc::default();
    let recorded = actions.clone();
    let board = window.update(cx, |_, _, cx| cx.entity()).unwrap();
    cx.update(|cx| {
        cx.subscribe(&board, move |_, event: &Event, _| {
            if let Event::Stage { action, .. } = event {
                recorded.borrow_mut().push(action.clone());
            }
        })
        .detach()
    });
    window
        .update(cx, |board, window, cx| {
            let snapshot = Snapshot {
                cards,
                ..Default::default()
            };
            board.finish(board.revision, Ok(snapshot), cx);
            window.focus(&board.focus, cx);
        })
        .unwrap();
    (window, actions)
}

fn idle(id: &str, column: &str) -> Card {
    let mut card = card(id, column);
    card.run_state = "idle".into();
    card
}

/// Presses on the card and moves onto the column without releasing.
fn lift(
    visual: &mut VisualTestContext,
    card: &'static str,
    column: &'static str,
) -> gpui::Point<gpui::Pixels> {
    let from = visual.debug_bounds(card).unwrap().center();
    let target = visual.debug_bounds(column).unwrap();
    let to = point(target.center().x, target.top() + px(120.));
    visual.simulate_mouse_down(from, MouseButton::Left, Default::default());
    visual.simulate_mouse_move(
        from + point(px(12.), px(4.)),
        MouseButton::Left,
        Default::default(),
    );
    visual.simulate_mouse_move(to, MouseButton::Left, Default::default());
    visual.run_until_parked();
    to
}

fn release(visual: &mut VisualTestContext, at: gpui::Point<gpui::Pixels>) {
    visual.simulate_mouse_up(at, MouseButton::Left, Default::default());
    visual.run_until_parked();
}

#[gpui::test]
fn dragging_a_backlog_card_onto_grill_starts_it_once(cx: &mut TestAppContext) {
    let (window, actions) = show(cx, vec![idle("a", "backlog")]);
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();

    let at = lift(visual, "board-card-a", "board-column-grill");
    window
        .update(visual, |board, _, cx| {
            let (id, moves) = board.drag_targets(cx).expect("drag in progress");
            assert_eq!(id, "a");
            assert_eq!(
                moves.iter().map(|m| m.column.as_str()).collect::<Vec<_>>(),
                ["grill"]
            );
            assert_eq!(board.drag_over.as_deref(), Some("grill"));
        })
        .unwrap();
    release(visual, at);

    assert_eq!(*actions.borrow(), [StageAction::Start]);
    window
        .update(visual, |board, _, _| assert!(board.dragging.is_none()))
        .unwrap();
}

#[gpui::test]
fn illegal_drops_do_nothing_and_input_drops_open_the_panel(cx: &mut TestAppContext) {
    let (window, actions) = show(cx, vec![idle("p", "plan_approval")]);
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();

    let at = lift(visual, "board-card-p", "board-column-backlog");
    release(visual, at);
    assert!(actions.borrow().is_empty());
    window
        .update(visual, |board, _, _| assert!(board.review.is_none()))
        .unwrap();

    let at = lift(visual, "board-card-p", "board-column-grill");
    release(visual, at);
    assert!(actions.borrow().is_empty());
    window
        .update(visual, |board, _, _| assert!(board.review.is_some()))
        .unwrap();
}

#[gpui::test]
fn escape_cancels_a_drag_before_it_drops(cx: &mut TestAppContext) {
    let (window, actions) = show(cx, vec![idle("a", "backlog")]);
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();

    let at = lift(visual, "board-card-a", "board-column-grill");
    visual.simulate_keystrokes("escape");
    window
        .update(visual, |board, _, cx| {
            assert!(board.dragging.is_none());
            assert!(!cx.has_active_drag());
        })
        .unwrap();
    release(visual, at);

    assert!(actions.borrow().is_empty());
}

#[test]
fn edge_scroll_speeds_up_toward_the_board_edges() {
    assert_eq!(edge_scroll_step(500., 0., 1000.), 0.);
    assert_eq!(edge_scroll_step(0., 0., 1000.), -18.);
    assert_eq!(edge_scroll_step(28., 0., 1000.), -9.);
    assert_eq!(edge_scroll_step(1000., 0., 1000.), 18.);
    assert!(edge_scroll_step(990., 0., 1000.) > edge_scroll_step(960., 0., 1000.));
}
