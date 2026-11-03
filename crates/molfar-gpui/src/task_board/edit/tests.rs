use super::super::{
    Board,
    settings::tests::click,
    tests::{card, window},
};
use crate::task_board::Event;
use gpui::{TestAppContext, VisualTestContext, WindowHandle};
use molfar_core::task_board::{
    stage::{lifecycle::types::StageAction, owner::types::TaskEdit},
    types::{Card, Snapshot},
};
use std::{cell::RefCell, rc::Rc};

type Actions = Rc<RefCell<Vec<(i64, StageAction)>>>;

fn show(cx: &mut TestAppContext, card: Card) -> (WindowHandle<Board>, Actions) {
    let window = window(cx);
    let actions: Actions = Rc::default();
    let recorded = actions.clone();
    let board = window.update(cx, |_, _, cx| cx.entity()).unwrap();
    cx.update(|cx| {
        cx.subscribe(&board, move |_, event: &Event, _| {
            if let Event::Stage {
                updated_at, action, ..
            } = event
            {
                recorded.borrow_mut().push((*updated_at, action.clone()));
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
            board.finish(board.revision, Ok(snapshot), cx);
        })
        .unwrap();
    (window, actions)
}

fn idle(column: &str) -> Card {
    let mut card = card("card", column);
    card.run_state = "idle".into();
    card.base_ref = Some("main".into());
    card.updated_at = 42;
    card
}

fn set(
    window: WindowHandle<Board>,
    visual: &mut VisualTestContext,
    pick: fn(&super::TaskEditor) -> &gpui::Entity<crate::input::Input>,
    text: &str,
) {
    let text = text.to_owned();
    window
        .update(visual, |board, _, cx| {
            let field = pick(board.editor.as_ref().unwrap()).clone();
            field.update(cx, |input, cx| input.set_text(text, cx));
        })
        .unwrap();
}

#[gpui::test]
fn backlog_editor_prefills_saves_once_and_closes_on_success(cx: &mut TestAppContext) {
    let (window, actions) = show(cx, idle("backlog"));
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();

    click(visual, "board-edit-task");
    window
        .update(visual, |board, _, cx| {
            let editor = board.editor.as_ref().unwrap();
            assert_eq!(editor.fields.base.read(cx).content.as_ref(), "main");
            assert!(editor.base_editable);
        })
        .unwrap();
    set(window, visual, |editor| &editor.fields.title, " Renamed ");
    set(window, visual, |editor| &editor.fields.base, "  ");
    click(visual, "board-edit-submit");
    click(visual, "board-edit-submit");

    let recorded = actions.borrow().clone();
    assert_eq!(recorded.len(), 1);
    let (revision, StageAction::EditTask(edit)) = &recorded[0] else {
        panic!("expected EditTask");
    };
    assert_eq!(*revision, 42);
    assert_eq!(edit.title, " Renamed ");
    assert_eq!(edit.base_ref, Some(None));
    window
        .update(visual, |board, _, cx| {
            board.finish_update(None, cx);
            assert!(board.editor.is_none());
        })
        .unwrap();
}

#[gpui::test]
fn plan_approval_editor_locks_base_and_keeps_draft_after_conflict(cx: &mut TestAppContext) {
    let (window, actions) = show(cx, idle("plan_approval"));
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();

    click(visual, "board-edit-task");
    set(
        window,
        visual,
        |editor| &editor.fields.description,
        "Keep me",
    );
    click(visual, "board-edit-submit");
    window
        .update(visual, |board, _, cx| {
            board.finish_update(
                Some("conflict: the card changed; reload and try again".into()),
                cx,
            );
            let editor = board.editor.as_ref().unwrap();
            assert_eq!(
                editor.fields.description.read(cx).content.as_ref(),
                "Keep me"
            );
            assert!(editor.reload_required);
            assert!(!editor.can_submit(cx));
        })
        .unwrap();
    visual.run_until_parked();

    assert!(matches!(
        &actions.borrow()[0].1,
        StageAction::EditTask(TaskEdit { base_ref: None, .. })
    ));
    assert!(visual.debug_bounds("board-edit-error").is_some());
    click(visual, "board-edit-cancel");
    window
        .update(visual, |board, _, _| assert!(board.editor.is_none()))
        .unwrap();
}

#[gpui::test]
fn edit_is_hidden_outside_idle_backlog_and_plan_approval(cx: &mut TestAppContext) {
    let mut running = idle("backlog");
    running.run_state = "running".into();
    for card in [idle("final_review"), running] {
        let (window, _) = show(cx, card);
        let visual = &mut VisualTestContext::from_window(window.into(), cx);
        visual.run_until_parked();
        assert!(visual.debug_bounds("board-edit-task").is_none());
    }
}

#[gpui::test]
fn background_results_do_not_complete_a_busy_edit_and_focus_returns_after_save(
    cx: &mut TestAppContext,
) {
    let (window, _) = show(cx, idle("backlog"));
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    click(visual, "board-edit-task");
    click(visual, "board-edit-submit");

    window
        .update(visual, |board, _, cx| {
            board.finish_background(Some("Delivery of another card failed".into()), cx);
            let editor = board.editor.as_ref().unwrap();
            assert!(editor.busy);
            assert_eq!(editor.error, None);
            assert_eq!(board.stage_pending.as_deref(), Some("card"));
            board.finish_update(None, cx);
        })
        .unwrap();
    visual.run_until_parked();

    window
        .update(visual, |board, window, _| {
            assert!(board.editor.is_none());
            assert!(board.focus.is_focused(window));
        })
        .unwrap();
}
