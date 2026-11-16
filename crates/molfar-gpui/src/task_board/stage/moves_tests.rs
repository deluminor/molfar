use super::super::super::{
    Board, Event,
    settings::tests::click,
    tests::{card, window},
};
use gpui::{TestAppContext, VisualTestContext, WindowHandle};
use molfar_core::task_board::{
    stage::lifecycle::types::StageAction,
    types::{Card, Snapshot},
};
use std::{cell::RefCell, rc::Rc};

type Actions = Rc<RefCell<Vec<StageAction>>>;

fn show(cx: &mut TestAppContext, card: Card) -> (WindowHandle<Board>, Actions) {
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
        .update(cx, |board, _, cx| {
            let snapshot = Snapshot {
                cards: vec![card],
                selected: Some("card".into()),
                ..Default::default()
            };
            board.drawer_open = true;
            board.finish(board.revision, Ok(snapshot), cx);
        })
        .unwrap();
    (window, actions)
}

fn at(column: &str, state: &str) -> Card {
    let mut card = card("card", column);
    card.run_state = state.into();
    card.worktree_path = Some("/retained/card".into());
    card
}

fn targets(
    window: WindowHandle<Board>,
    visual: &mut VisualTestContext,
    card: &Card,
) -> Vec<String> {
    window
        .update(visual, |board, _, _| {
            board
                .card_moves(card)
                .into_iter()
                .map(|target| target.column)
                .collect()
        })
        .unwrap()
}

fn pick(window: WindowHandle<Board>, visual: &mut VisualTestContext, card: &Card, column: &str) {
    let card = card.clone();
    let column = column.to_owned();
    window
        .update(visual, |board, window, cx| {
            board.apply_move(&card, &column, window, cx)
        })
        .unwrap();
    visual.run_until_parked();
}

#[gpui::test]
fn immediate_moves_emit_their_stage_action_once(cx: &mut TestAppContext) {
    let backlog = at("backlog", "idle");
    let (window, actions) = show(cx, backlog.clone());
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();

    click(visual, "board-move-to");
    window
        .update(visual, |board, _, _| assert!(board.move_menu.is_some()))
        .unwrap();
    assert_eq!(targets(window, visual, &backlog), ["grill"]);
    pick(window, visual, &backlog, "grill");
    pick(window, visual, &backlog, "grill");

    assert_eq!(*actions.borrow(), [StageAction::Start]);
}

#[gpui::test]
fn input_moves_open_the_owner_panel_instead_of_acting(cx: &mut TestAppContext) {
    let gate = at("plan_approval", "idle");
    let (window, actions) = show(cx, gate.clone());
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    assert_eq!(targets(window, visual, &gate), ["implement", "grill"]);

    pick(window, visual, &gate, "grill");

    assert!(actions.borrow().is_empty());
    window
        .update(visual, |board, _, _| assert!(board.review.is_some()))
        .unwrap();

    let reviewed = at("final_review", "idle");
    let (window, actions) = show(cx, reviewed.clone());
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    window
        .update(visual, |board, _, _| {
            board.github.insert("/retained/card".into(), true);
        })
        .unwrap();
    assert_eq!(targets(window, visual, &reviewed), ["rework", "done"]);
    pick(window, visual, &reviewed, "done");

    assert!(actions.borrow().is_empty());
    assert!(visual.debug_bounds("board-deliver-pr").is_some());
}

#[gpui::test]
fn back_follows_the_readable_review_guard(cx: &mut TestAppContext) {
    let review = at("code_review", "failed");
    let (window, _) = show(cx, review.clone());
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    assert!(targets(window, visual, &review).is_empty());
    assert!(visual.debug_bounds("board-move-to").is_none());

    let implement = at("implement", "failed");
    let (window, actions) = show(cx, implement.clone());
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    pick(window, visual, &implement, "plan_approval");
    assert_eq!(*actions.borrow(), [StageAction::Back]);
}
