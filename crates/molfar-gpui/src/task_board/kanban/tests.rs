use super::status::{StatusKind, status};
use crate::task_board::{
    Board,
    settings::tests::click,
    tests::{card, window},
};
use gpui::{TestAppContext, VisualTestContext, WindowHandle};
use molfar_core::task_board::types::{Card, Snapshot};

fn snapshot(cards: Vec<Card>, selected: Option<&str>) -> Snapshot {
    Snapshot {
        cards,
        selected: selected.map(str::to_owned),
        settings_json: Some(
            r#"{"columns":{"implement":{"harness":"codex","model":"codex:gpt-5"}}}"#.into(),
        ),
        ..Default::default()
    }
}

fn show(cx: &mut TestAppContext, cards: Vec<Card>, selected: Option<&str>) -> WindowHandle<Board> {
    let window = window(cx);
    window
        .update(cx, |board, window, cx| {
            board.selected = selected.map(str::to_owned);
            board.drawer_open = true;
            board.finish(board.revision, Ok(snapshot(cards, selected)), cx);
            window.focus(&board.focus, cx);
        })
        .unwrap();
    window
}

fn at(id: &str, column: &str, state: &str) -> Card {
    let mut card = card(id, column);
    card.run_state = state.into();
    card
}

fn selected(window: WindowHandle<Board>, visual: &mut VisualTestContext) -> Option<String> {
    window
        .update(visual, |board, _, _| board.selected.clone())
        .unwrap()
}

#[gpui::test]
fn drawer_stays_closed_across_refreshes_and_escape_then_closes_the_board(cx: &mut TestAppContext) {
    let cards = vec![at("a", "backlog", "idle")];
    let window = show(cx, cards.clone(), Some("a"));
    let closed = std::rc::Rc::new(std::cell::Cell::new(false));
    let seen = closed.clone();
    let board = window.update(cx, |_, _, cx| cx.entity()).unwrap();
    cx.update(|cx| {
        cx.subscribe(&board, move |_, event: &crate::task_board::Event, _| {
            if matches!(event, crate::task_board::Event::Close) {
                seen.set(true);
            }
        })
        .detach()
    });
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    assert!(visual.debug_bounds("board-detail-drawer").is_some());

    click(visual, "board-detail-close");
    window
        .update(visual, |board, _, cx| {
            board.finish(board.revision, Ok(snapshot(cards.clone(), Some("a"))), cx)
        })
        .unwrap();
    visual.run_until_parked();
    assert!(visual.debug_bounds("board-detail-drawer").is_none());
    assert_eq!(selected(window, visual).as_deref(), Some("a"));

    visual.simulate_keystrokes("enter");
    visual.run_until_parked();
    assert!(visual.debug_bounds("board-detail-drawer").is_some());
    visual.simulate_keystrokes("escape");
    visual.run_until_parked();
    assert!(visual.debug_bounds("board-detail-drawer").is_none());
    assert!(!closed.get());
    visual.simulate_keystrokes("escape");
    assert!(closed.get());
}

#[gpui::test]
fn drawer_reserves_width_and_last_column_remains_reachable(cx: &mut TestAppContext) {
    let window = show(cx, vec![at("left", "backlog", "idle")], Some("left"));
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    for width in [1440., 1000., 768., 420.] {
        visual.simulate_window_resize(window.into(), gpui::size(gpui::px(width), gpui::px(700.)));
        visual.run_until_parked();
        let drawer = visual.debug_bounds("board-detail-drawer").unwrap();
        let columns = visual.debug_bounds("board-list").unwrap();
        assert!(columns.size.width > gpui::px(0.));
        assert!(
            columns.right() <= drawer.left() + gpui::px(1.),
            "overlapping at {width}"
        );
        window
            .update(visual, |board, _, cx| {
                let max = board.scroll.max_offset();
                board.scroll.set_offset(gpui::point(-max.x, gpui::px(0.)));
                cx.notify();
            })
            .unwrap();
        visual.run_until_parked();
        let last = visual.debug_bounds("board-column-done").unwrap();
        assert!(
            last.right() <= columns.right() + gpui::px(1.),
            "last column unreachable at {width}"
        );
        assert!(last.right() > columns.left());
        assert_eq!(drawer, visual.debug_bounds("board-detail-drawer").unwrap());
    }
    click(visual, "board-detail-close");
    visual.run_until_parked();
    assert!(visual.debug_bounds("board-detail-drawer").is_none());
    assert_eq!(selected(window, visual).as_deref(), Some("left"));
}

#[gpui::test]
fn arrows_move_within_and_across_non_empty_columns(cx: &mut TestAppContext) {
    let cards = vec![
        at("b1", "backlog", "idle"),
        at("b2", "backlog", "idle"),
        at("r1", "final_review", "idle"),
    ];
    let window = show(cx, cards, Some("b1"));
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();

    window
        .update(visual, |board, _, cx| {
            let mut step = |board: &mut Board, keys: &str| {
                match keys {
                    "down" => board.move_selection(true, cx),
                    "right" => board.move_column(true, cx),
                    _ => board.move_column(false, cx),
                }
                board.selected.clone()
            };
            assert_eq!(step(board, "down").as_deref(), Some("b2"));
            assert_eq!(step(board, "right").as_deref(), Some("r1"));
            assert_eq!(step(board, "right").as_deref(), Some("r1"));
            assert_eq!(step(board, "left").as_deref(), Some("b1"));
        })
        .unwrap();
}

#[gpui::test]
fn agent_columns_show_the_saved_model_and_open_column_settings(cx: &mut TestAppContext) {
    let window = show(cx, vec![], None);
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();

    assert!(visual.debug_bounds("board-column-model-grill").is_some());
    assert!(visual.debug_bounds("board-column-model-backlog").is_none());
    assert!(visual.debug_bounds("board-empty").is_some());
    window
        .update(visual, |board, _, _| {
            assert_eq!(
                board.column_model(molfar_core::task_board::stage::agent::AgentStage::Implement),
                "GPT-5"
            );
        })
        .unwrap();
    click(visual, "board-column-model-grill");
    window
        .update(visual, |board, _, _| {
            assert!(board.picker.is_none());
            assert_eq!(
                board.settings.as_ref().unwrap().column,
                Some(molfar_core::task_board::stage::agent::AgentStage::Grill)
            );
        })
        .unwrap();
}

#[test]
fn card_status_matches_desktop_labels() {
    let cases = [
        (
            at("a", "grill", "failed"),
            Some((StatusKind::Failed, "Failed")),
        ),
        (
            at("a", "implement", "queued"),
            Some((StatusKind::Queued, "Queued")),
        ),
        (
            at("a", "final_review", "running"),
            Some((StatusKind::Running, "Delivering")),
        ),
        (
            at("a", "code_review", "running"),
            Some((StatusKind::Running, "Running")),
        ),
        (
            at("a", "plan_approval", "idle"),
            Some((StatusKind::NeedsYou, "Needs you")),
        ),
        (
            at("a", "done", "idle"),
            Some((StatusKind::Delivered, "Delivered")),
        ),
        (at("a", "backlog", "idle"), None),
    ];
    for (card, expected) in cases {
        assert_eq!(
            status(&card),
            expected,
            "{}/{}",
            card.column_id,
            card.run_state
        );
    }
}

#[gpui::test]
fn unselected_failed_reviews_keep_back_for_the_core_guard(cx: &mut TestAppContext) {
    let failed = at("r", "code_review", "failed");
    let window = show(
        cx,
        vec![failed.clone(), at("b", "backlog", "idle")],
        Some("b"),
    );
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();

    let targets = window
        .update(visual, |board, _, _| {
            board
                .card_moves(&failed)
                .into_iter()
                .map(|target| target.column)
                .collect::<Vec<_>>()
        })
        .unwrap();

    assert_eq!(targets, ["final_review"]);
}
