use super::*;
use crate::task_board::{
    Event,
    tests::{card, window},
};
use gpui::{EntityInputHandler, Focusable, TestAppContext, VisualTestContext};
use molfar_core::task_board::stage::{
    lifecycle::types::StageAction,
    owner::types::{Question, Review},
};
use std::{cell::RefCell, rc::Rc};

pub(super) fn data() -> Review {
    let mut card = card("card", "plan_approval");
    card.updated_at = 42;
    card.run_state = "idle".into();
    Review {
        card,
        questions: vec![Question {
            number: 3,
            title: "Scope".into(),
            body: "Which scope should be used?".into(),
            recommended: "Keep it narrow".into(),
        }],
        plan: "# Original plan".into(),
    }
}

pub(super) fn ready(cx: &mut TestAppContext, mode: Mode) -> gpui::WindowHandle<Board> {
    cx.update(|cx| {
        input::bind(cx);
        cx.set_reduce_motion(true);
    });
    let window = window(cx);
    window
        .update(cx, |board, window, cx| {
            board.open_owner_review("card".into(), mode, window, cx)
        })
        .unwrap();
    {
        let visual = &mut VisualTestContext::from_window(window.into(), cx);
        visual.run_until_parked();
    }
    window
        .update(cx, |board, window, cx| {
            board.finish_owner_load(board.review_revision, Ok(data().into()), window, cx);
        })
        .unwrap();
    window
}

#[gpui::test]
fn owner_review_load_error_can_retry_and_closed_load_cannot_replace_new_review(
    cx: &mut TestAppContext,
) {
    let window = window(cx);
    window
        .update(cx, |board, window, cx| {
            board.open_owner_review("missing".into(), Mode::Questions, window, cx)
        })
        .unwrap();
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    assert!(visual.debug_bounds("board-owner-error").is_some());
    assert!(visual.debug_bounds("board-owner-retry-load").is_some());
    window
        .update(visual, |board, window, cx| {
            let old = board.review_revision;
            board.close_owner_review(window, cx);
            board.open_owner_review("new-card".into(), Mode::Plan, window, cx);
            board.finish_owner_load(old, Ok(data().into()), window, cx);
            assert_eq!(board.review.as_ref().unwrap().card_id, "new-card");
            assert!(board.review.as_ref().unwrap().data.is_none());
        })
        .unwrap();
}

#[gpui::test]
fn owner_answers_use_loaded_revision_and_survive_failed_submit_without_duplicates(
    cx: &mut TestAppContext,
) {
    let window = ready(cx, Mode::Questions);
    let events = Rc::new(RefCell::new(Vec::new()));
    let recorded = events.clone();
    let board = window.update(cx, |_, _, cx| cx.entity()).unwrap();
    cx.update(|cx| {
        cx.subscribe(&board, move |_, event: &Event, _| {
            if let Event::Stage {
                card_id,
                updated_at,
                action,
            } = event
            {
                recorded
                    .borrow_mut()
                    .push((card_id.clone(), *updated_at, action.clone()));
            }
        })
        .detach()
    });
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    assert!(visual.debug_bounds("board-owner-dialog").is_some());
    visual.simulate_input(" plus details");
    visual.simulate_keystrokes(if cfg!(target_os = "macos") {
        "cmd-enter"
    } else {
        "ctrl-enter"
    });
    let answer = window
        .update(visual, |board, window, cx| {
            let answer = board.review.as_ref().unwrap().answers[0]
                .read(cx)
                .content
                .to_string();
            board.submit_owner_review(false, cx);
            board.submit_owner_review(false, cx);
            board.close_owner_review(window, cx);
            assert!(board.review.as_ref().unwrap().busy);
            answer
        })
        .unwrap();
    visual.run_until_parked();
    assert_eq!(events.borrow().len(), 1);
    {
        let recorded = events.borrow();
        let (id, updated, action) = &recorded[0];
        assert_eq!((id.as_str(), *updated), ("card", 42));
        let StageAction::Answer { answers, .. } = action else {
            panic!("wrong owner action")
        };
        assert_eq!(answers[0].number, 3);
        assert_eq!(answers[0].answer, answer);
    }
    window
        .update(visual, |board, _, cx| {
            board.finish_update(Some("Artifact write failed".into()), cx);
            let panel = board.review.as_ref().unwrap();
            assert!(!panel.busy);
            assert_eq!(panel.answers[0].read(cx).content.as_ref(), answer);
            assert_eq!(panel.error.as_deref(), Some("Artifact write failed"));
        })
        .unwrap();
    visual.run_until_parked();
    assert!(visual.debug_bounds("board-owner-error").is_some());
    window
        .update(visual, |board, _, cx| {
            board.submit_owner_review(false, cx);
        })
        .unwrap();
    visual.run_until_parked();
    assert_eq!(events.borrow().len(), 2);
    window
        .update(visual, |board, _, cx| {
            board.finish_update(None, cx);
            assert!(board.review.is_none());
        })
        .unwrap();
}

#[gpui::test]
fn owner_plan_editor_preserves_versions_and_text_input_does_not_toggle_board(
    cx: &mut TestAppContext,
) {
    let window = ready(cx, Mode::Plan);
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    window
        .update(visual, |board, _, cx| {
            assert!(!board.review.as_ref().unwrap().can_submit(false, cx));
        })
        .unwrap();
    visual.simulate_input("p a r n");
    window
        .update(visual, |board, _, cx| {
            let panel = board.review.as_ref().unwrap();
            assert!(panel.can_submit(false, cx));
            assert_eq!(panel.data.as_ref().unwrap().plan(), "# Original plan");
            assert!(!board.project_only && !board.archived && !board.create_open);
            board.submit_owner_review(false, cx);
            assert!(board.review.as_ref().unwrap().busy);
        })
        .unwrap();
}

#[gpui::test]
fn owner_review_tab_cycle_and_ime_shortcut_keep_composition_unsubmitted(cx: &mut TestAppContext) {
    let window = ready(cx, Mode::Questions);
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    visual.simulate_keystrokes("shift-tab");
    window
        .update(visual, |board, window, _| {
            assert!(
                board
                    .review
                    .as_ref()
                    .unwrap()
                    .submit_focus
                    .is_focused(window)
            )
        })
        .unwrap();
    visual.simulate_keystrokes("tab");
    window
        .update(visual, |board, window, cx| {
            let input = board.review.as_ref().unwrap().answers[0].clone();
            assert!(input.read(cx).focus_handle(cx).is_focused(window));
            input.update(cx, |input, cx| {
                input.replace_and_mark_text_in_range(None, "日本", Some(2..2), window, cx)
            });
        })
        .unwrap();
    visual.simulate_keystrokes(if cfg!(target_os = "macos") {
        "cmd-enter"
    } else {
        "ctrl-enter"
    });
    window
        .update(visual, |board, _, _| {
            assert!(!board.review.as_ref().unwrap().busy)
        })
        .unwrap();
}

#[gpui::test]
fn owner_note_only_review_requires_text_and_submits_request_changes(cx: &mut TestAppContext) {
    let window = ready(cx, Mode::Questions);
    window
        .update(cx, |board, window, cx| {
            let mut review = data();
            review.questions.clear();
            board.finish_owner_load(board.review_revision, Ok(review.into()), window, cx);
            assert!(!board.review.as_ref().unwrap().can_submit(false, cx));
            board.review.as_ref().unwrap().note.update(cx, |input, cx| {
                input.set_text("Please expand tests".into(), cx)
            });
            assert!(board.review.as_ref().unwrap().can_submit(false, cx));
            board.submit_owner_review(false, cx);
            assert!(board.review.as_ref().unwrap().busy);
        })
        .unwrap();
}
