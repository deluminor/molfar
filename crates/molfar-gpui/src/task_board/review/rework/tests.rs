use super::super::*;
use crate::task_board::{Event, tests::card};
use gpui::{Focusable, TestAppContext, VisualTestContext};
use molfar_core::task_board::stage::{
    contracts::review, lifecycle::types::StageAction, owner::types::FinalReview,
};
use std::{cell::RefCell, rc::Rc};

fn ready(cx: &mut TestAppContext) -> gpui::WindowHandle<Board> {
    let window = tests::ready(cx, Mode::Rework);
    window.update(cx, |board, window, cx| {
        let mut card = card("card", "final_review"); card.run_state = "idle".into(); card.updated_at = 42;
        board.finish_owner_load(board.review_revision, Ok(Content::Final(FinalReview { card, version: 3, review: review::parse("Verdict: CHANGES_REQUESTED\n\n## F1 [major] Race\nFix race.\n\n## F2 [nit] Rename\nOptional.").unwrap() })), window, cx);
    }).unwrap();
    window
}

#[gpui::test]
fn rework_preselects_major_keeps_explicit_selection_and_emits_once(cx: &mut TestAppContext) {
    let window = ready(cx);
    let events = Rc::new(RefCell::new(Vec::new()));
    let recorded = events.clone();
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
            assert_eq!(
                board
                    .review
                    .as_ref()
                    .unwrap()
                    .selected
                    .iter()
                    .cloned()
                    .collect::<Vec<_>>(),
                vec!["F1"]
            );
            board.toggle_rework_finding(0, cx);
            assert!(!board.review.as_ref().unwrap().can_submit(false, cx));
            board.toggle_rework_finding(1, cx);
            board
                .review
                .as_ref()
                .unwrap()
                .note
                .update(cx, |input, cx| input.set_text("Only rename".into(), cx));
            board.submit_owner_review(false, cx);
            board.submit_owner_review(false, cx);
            board.toggle_rework_finding(0, cx);
        })
        .unwrap();
    assert_eq!(
        *events.borrow(),
        vec![(
            42,
            StageAction::Rework {
                findings: vec!["F2".into()],
                note: "Only rename".into(),
                review_version: 3
            }
        )]
    );
}

#[gpui::test]
fn rework_keyboard_selection_and_failed_submit_preserve_draft(cx: &mut TestAppContext) {
    let window = ready(cx);
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    assert!(visual.debug_bounds("board-rework-finding-0").is_some());
    window
        .update(visual, |board, window, cx| {
            let panel = board.review.as_ref().unwrap();
            window.focus(&panel.finding_focus[1], cx);
        })
        .unwrap();
    visual.simulate_keystrokes("space");
    window
        .update(visual, |board, _, cx| {
            assert!(board.review.as_ref().unwrap().selected.contains("F2"));
            board
                .review
                .as_ref()
                .unwrap()
                .note
                .update(cx, |input, cx| input.set_text("Keep my note".into(), cx));
            board.submit_owner_review(false, cx);
            board.finish_update(Some("temporary failure".into()), cx);
            let panel = board.review.as_ref().unwrap();
            assert_eq!(panel.note.read(cx).content.as_ref(), "Keep my note");
            assert!(panel.selected.contains("F2"));
            assert!(panel.can_submit(false, cx));
            board.submit_owner_review(false, cx);
            board.finish_update(Some("conflict: changed".into()), cx);
            assert!(!board.review.as_ref().unwrap().can_submit(false, cx));
        })
        .unwrap();
}

#[gpui::test]
fn rework_focus_follows_visual_order_findings_then_note(cx: &mut TestAppContext) {
    let window = ready(cx);

    window
        .update(cx, |board, _, cx| {
            let panel = board.review.as_ref().unwrap();
            let handles = panel.handles(cx);
            let note = panel.note.read(cx).focus_handle(cx);

            assert_eq!(panel.initial_focus(cx), panel.finding_focus[0]);
            assert_eq!(handles[..2], panel.finding_focus[..]);
            assert_eq!(handles[2], note);
        })
        .unwrap();
}

#[gpui::test]
fn rework_findings_render_as_one_soft_list_inside_the_sheet(cx: &mut TestAppContext) {
    let window = ready(cx);
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();

    let dialog = visual.debug_bounds("board-owner-dialog").unwrap();
    let first = visual.debug_bounds("board-rework-finding-0").unwrap();
    let second = visual.debug_bounds("board-rework-finding-1").unwrap();

    assert_eq!(first.size.width, second.size.width);
    assert!(second.top() - first.bottom() <= gpui::px(1.5));
    assert!(dialog.left() < first.left() && first.right() < dialog.right());
    assert!(dialog.size.width - first.size.width < gpui::px(40.));
}
