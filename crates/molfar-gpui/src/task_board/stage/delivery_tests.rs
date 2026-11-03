use super::super::{
    Board,
    settings::tests::{click, record},
    tests::{card, window},
};
use super::delivery::{pull_request_url, status_text};
use gpui::{TestAppContext, VisualTestContext, WindowHandle};
use molfar_core::task_board::types::{Card, Snapshot};

fn show(cx: &mut TestAppContext, card: Card, github: Option<bool>) -> WindowHandle<Board> {
    let window = window(cx);
    window
        .update(cx, |board, _, cx| {
            if let (Some(path), Some(available)) = (card.worktree_path.clone(), github) {
                board.github.insert(path, available);
            }
            let snapshot = Snapshot {
                cards: vec![card],
                selected: Some("card".into()),
                ..Default::default()
            };
            board.drawer_open = true;
            board.finish(board.revision, Ok(snapshot), cx);
        })
        .unwrap();
    window
}

fn reviewed(state: &str) -> Card {
    let mut card = card("card", "final_review");
    card.run_state = state.into();
    card.worktree_path = Some("/retained/card".into());
    card
}

#[gpui::test]
fn deliver_offers_three_methods_and_emits_once(cx: &mut TestAppContext) {
    let window = show(cx, reviewed("idle"), Some(true));
    let events = record(&window, cx);
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();

    click(visual, "board-deliver");
    for selector in [
        "board-deliver-pr",
        "board-deliver-merge",
        "board-deliver-keep",
    ] {
        assert!(visual.debug_bounds(selector).is_some(), "{selector}");
    }
    click(visual, "board-deliver-pr");

    assert_eq!(*events.borrow(), ["Deliver(Pr)"]);
    assert!(visual.debug_bounds("board-deliver-pr").is_none());
    window
        .update(visual, |board, _, _| {
            assert_eq!(board.stage_pending.as_deref(), Some("card"))
        })
        .unwrap();
}

#[gpui::test]
fn unavailable_github_offers_keep_only(cx: &mut TestAppContext) {
    let window = show(cx, reviewed("failed"), Some(false));
    let events = record(&window, cx);
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();

    click(visual, "board-deliver");

    assert!(visual.debug_bounds("board-deliver-pr").is_none());
    assert!(visual.debug_bounds("board-deliver-merge").is_none());
    click(visual, "board-deliver-keep");
    assert_eq!(*events.borrow(), ["Deliver(Keep)"]);
}

#[gpui::test]
fn squash_merge_and_reject_require_confirmation(cx: &mut TestAppContext) {
    let window = show(cx, reviewed("idle"), Some(true));
    let events = record(&window, cx);
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();

    click(visual, "board-deliver");
    click(visual, "board-deliver-merge");
    assert!(visual.has_pending_prompt());
    visual.simulate_prompt_answer("Cancel");
    visual.run_until_parked();
    assert!(events.borrow().is_empty());
    click(visual, "board-deliver-merge");
    visual.simulate_prompt_answer("Merge");
    visual.run_until_parked();
    assert_eq!(*events.borrow(), ["Deliver(Merge)"]);

    window
        .update(visual, |board, _, cx| {
            board.stage_pending = None;
            cx.notify();
        })
        .unwrap();
    visual.run_until_parked();
    click(visual, "board-reject");
    visual.simulate_prompt_answer("Reject");
    visual.run_until_parked();
    assert_eq!(*events.borrow(), ["Deliver(Merge)", "Reject"]);
}

#[gpui::test]
fn done_cards_archive_and_running_cards_hide_destructive_actions(cx: &mut TestAppContext) {
    let mut done = card("card", "done");
    done.run_state = "idle".into();
    done.delivery_json =
        Some(r#"{"method":"pr","deliveredAt":1,"prUrl":"https://github.com/a/b/pull/3"}"#.into());
    assert_eq!(status_text(&done), "Delivered");
    assert_eq!(
        pull_request_url(&done).as_deref(),
        Some("https://github.com/a/b/pull/3")
    );
    let window = show(cx, done, None);
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    assert!(visual.debug_bounds("board-archive").is_some());
    assert!(visual.debug_bounds("board-deliver").is_none());

    let delivering = reviewed("running");
    assert_eq!(status_text(&delivering), "Delivering");
    let window = show(cx, delivering, None);
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    assert!(visual.debug_bounds("board-reject").is_none());
    assert!(visual.debug_bounds("board-deliver").is_none());
}
