use super::*;
use crate::task_board::tests::card;
use gpui::{AppContext, TestAppContext};
use std::time::Duration;

#[gpui::test]
fn clock_stops_when_hidden_and_restarts_without_replacing_entity(cx: &mut TestAppContext) {
    let timeline = cx.new(|_| Timeline::default());
    let mut run = super::super::timeline_tests::run("live", Some("session"), 1);
    run.completed_at = None;
    let card = card("first", "backlog");
    timeline.update(cx, |timeline, cx| {
        timeline.sync(Some(card.clone()), vec![run.clone()], true, cx)
    });
    cx.run_until_parked();
    let before = timeline.read_with(cx, |timeline, _| timeline.now);
    cx.executor().advance_clock(Duration::from_secs(2));
    cx.run_until_parked();
    assert!(timeline.read_with(cx, |timeline, _| timeline.now) >= before + 1000);
    timeline.update(cx, |timeline, cx| {
        timeline.sync(Some(card.clone()), vec![run.clone()], false, cx)
    });
    let frozen = timeline.read_with(cx, |timeline, _| timeline.now);
    cx.executor().advance_clock(Duration::from_secs(3));
    cx.run_until_parked();
    assert_eq!(timeline.read_with(cx, |timeline, _| timeline.now), frozen);
    timeline.update(cx, |timeline, cx| {
        timeline.sync(Some(card), vec![run], true, cx)
    });
    assert!(timeline.read_with(cx, |timeline, _| timeline.task.is_some()));
    let weak = timeline.downgrade();
    drop(timeline);
    cx.run_until_parked();
    assert!(weak.upgrade().is_none());
}

#[gpui::test]
fn completion_stops_clock_and_foreign_card_runs_are_rejected(cx: &mut TestAppContext) {
    let timeline = cx.new(|_| Timeline::default());
    let mut run = super::super::timeline_tests::run("live", None, 1);
    run.completed_at = None;
    let first = card("first", "backlog");
    timeline.update(cx, |timeline, cx| {
        timeline.sync(Some(first.clone()), vec![run.clone()], true, cx)
    });
    assert!(timeline.read_with(cx, |timeline, _| timeline.task.is_some()));
    run.completed_at = Some(61_000);
    timeline.update(cx, |timeline, cx| {
        timeline.sync(Some(first), vec![run.clone()], true, cx)
    });
    assert!(timeline.read_with(cx, |timeline, _| timeline.task.is_none()));
    timeline.update(cx, |timeline, cx| {
        timeline.sync(Some(card("second", "backlog")), vec![run], true, cx)
    });
    assert!(timeline.read_with(cx, |timeline, _| timeline.runs.is_empty()));
}

#[gpui::test]
fn ticks_preserve_board_preview_and_keyboard_session_focus(cx: &mut TestAppContext) {
    use crate::task_board::detail::tests::show;
    use gpui::VisualTestContext;
    let window = show(cx, false);
    window
        .update(cx, |board, _, cx| {
            let mut run = super::super::timeline_tests::run("live", Some("keyboard-session"), 1);
            let now = chrono::Utc::now().timestamp_millis();
            run.started_at = now;
            run.completed_at = None;
            let mut complete = run.clone();
            complete.id = "complete".into();
            complete.completed_at = Some(now + 120_000);
            board.snapshot.as_mut().unwrap().runs = vec![run, complete];
            cx.notify();
        })
        .unwrap();
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    let before_width = visual
        .debug_bounds("board-preview-mark-live")
        .unwrap()
        .size
        .width;
    let (entity, preview, focus) = window
        .update(visual, |board, window, cx| {
            let focus = board.timeline.read(cx).session_focus["live"].clone();
            window.focus(&focus, cx);
            (
                board.timeline.entity_id(),
                board
                    .detail_content
                    .as_ref()
                    .unwrap()
                    .description_view
                    .entity_id(),
                focus,
            )
        })
        .unwrap();
    visual.executor().advance_clock(Duration::from_secs(2));
    visual.run_until_parked();
    assert!(
        visual
            .debug_bounds("board-preview-mark-live")
            .unwrap()
            .size
            .width
            > before_width
    );
    window
        .update(visual, |board, window, cx| {
            assert_eq!(board.timeline.entity_id(), entity);
            assert_eq!(
                board
                    .detail_content
                    .as_ref()
                    .unwrap()
                    .description_view
                    .entity_id(),
                preview
            );
            assert!(focus.is_focused(window));
            assert!(board.timeline.read(cx).task.is_some());
        })
        .unwrap();
    let seen = std::rc::Rc::new(std::cell::RefCell::new(Vec::new()));
    let events = seen.clone();
    let board = window.update(visual, |_, _, cx| cx.entity()).unwrap();
    visual.update(|_, cx| {
        cx.subscribe(&board, move |_, event: &crate::task_board::Event, _| {
            if let crate::task_board::Event::OpenSession(session) = event {
                events.borrow_mut().push(session.clone());
            }
        })
        .detach()
    });
    visual.simulate_keystrokes("enter");
    visual.run_until_parked();
    assert_eq!(*seen.borrow(), vec!["keyboard-session"]);
    window
        .update(visual, |board, _, cx| {
            board.set_page_visible(false, cx);
            assert!(board.timeline.read(cx).task.is_none());
            board.set_page_visible(true, cx);
            assert!(board.timeline.read(cx).task.is_some());
        })
        .unwrap();
    window
        .update(visual, |board, _, cx| board.close_detail(cx))
        .unwrap();
    window
        .update(visual, |board, _, cx| {
            assert!(board.timeline.read(cx).task.is_none())
        })
        .unwrap();
}
