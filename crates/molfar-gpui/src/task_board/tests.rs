use super::*;
use gpui::AppContext;
use gpui::{
    Bounds, TestAppContext, VisualTestContext, WindowBounds, WindowOptions, point, px, size,
};
use molfar_core::{store::Store, task_board::types::Card};
use std::sync::{Arc, Mutex};

fn card(id: &str, column: &str) -> Card {
    Card {
        id: id.into(),
        number: 1,
        project_cwd: "/project".into(),
        title: id.into(),
        description: "Task description".into(),
        acceptance_criteria: "Keep data".into(),
        column_id: column.into(),
        run_state: "running".into(),
        position: 1.,
        base_ref: None,
        base_sha: None,
        branch: None,
        worktree_path: None,
        grill_round: 0,
        rework_cycle: 0,
        overrides_json: "{}".into(),
        last_error: None,
        delivery_json: None,
        archived: false,
        queued_at: None,
        created_at: 1,
        updated_at: 2,
    }
}

fn database() -> Database {
    Arc::new(Mutex::new(
        Store::open_desktop(std::path::Path::new(":memory:")).unwrap(),
    ))
}

fn window(cx: &mut TestAppContext) -> gpui::WindowHandle<Board> {
    cx.update(|cx| {
        cx.open_window(
            WindowOptions {
                window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                    point(px(0.), px(0.)),
                    size(px(1000.), px(700.)),
                ))),
                ..Default::default()
            },
            |_, cx| cx.new(|cx| Board::new(database(), cx)),
        )
        .unwrap()
    })
}

#[gpui::test]
fn actual_empty_load_is_distinct_from_unavailable_and_can_retry(cx: &mut TestAppContext) {
    let window = window(cx);
    window.update(cx, |board, _, cx| board.refresh(cx)).unwrap();
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    assert!(visual.debug_bounds("board-empty").is_some());
    assert!(visual.debug_bounds("board-error").is_none());
    window
        .update(visual, |board, _, cx| {
            board.store = Arc::new(Mutex::new(
                Store::open(std::path::Path::new(":memory:")).unwrap(),
            ));
            board.refresh(cx);
        })
        .unwrap();
    visual.run_until_parked();
    assert!(visual.debug_bounds("board-error").is_some());
    assert!(visual.debug_bounds("board-empty").is_none());
    window
        .update(visual, |board, _, cx| {
            board.store = database();
            board.refresh(cx);
        })
        .unwrap();
    visual.run_until_parked();
    assert!(visual.debug_bounds("board-empty").is_some());
}

#[gpui::test]
fn stale_success_and_failure_cannot_replace_current_filter_or_selection(cx: &mut TestAppContext) {
    let board = cx.new(|cx| Board::new(database(), cx));
    board.update(cx, |board, cx| {
        board.revision = 2;
        board.loading = true;
        let current = Snapshot {
            cards: vec![card("current", "final_review")],
            selected: Some("current".into()),
            ..Default::default()
        };
        board.finish(2, Ok(current), cx);
        board.finish(1, Ok(Snapshot::default()), cx);
        board.finish(1, Err("Old account error".into()), cx);
        assert_eq!(board.selected.as_deref(), Some("current"));
        assert_eq!(board.snapshot.as_ref().unwrap().cards[0].id, "current");
        assert!(!board.loading);
        assert!(board.error.is_none());
    });
}

#[gpui::test]
fn native_browser_keeps_non_backlog_and_future_cards_visible(cx: &mut TestAppContext) {
    let window = window(cx);
    window
        .update(cx, |board, _, cx| {
            let snapshot = Snapshot {
                cards: vec![card("review", "final_review"), card("future", "future")],
                selected: Some("review".into()),
                ..Default::default()
            };
            board.finish(board.revision, Ok(snapshot), cx);
        })
        .unwrap();
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    assert!(visual.debug_bounds("board-card-review").is_some());
    assert!(visual.debug_bounds("board-card-future").is_some());
    assert!(visual.debug_bounds("board-detail").is_some());
    for selector in [
        "board-column-backlog",
        "board-column-grill",
        "board-column-plan_approval",
        "board-column-implement",
        "board-column-code_review",
        "board-column-final_review",
        "board-column-rework",
        "board-column-done",
    ] {
        assert!(visual.debug_bounds(selector).is_some());
    }
}

#[gpui::test]
fn keyboard_selection_reveals_cards_beyond_the_viewport(cx: &mut TestAppContext) {
    let directory = std::env::temp_dir().join(format!(
        "molfar-board-test-{}",
        molfar_core::familiar::new_id()
    ));
    std::fs::create_dir_all(&directory).unwrap();
    let path = directory.join("molfar.db");
    drop(Store::open_desktop(&path).unwrap());
    let conn = rusqlite::Connection::open(&path).unwrap();
    for index in 0..30 {
        conn.execute("INSERT INTO task_board_cards(id,number,project_cwd,title,description,column_id,position,created_at,updated_at) VALUES(?1,?2,'/project',?1,'Task','backlog',?2,1,2)", rusqlite::params![format!("card-{index}"), index]).unwrap();
    }
    drop(conn);
    let store = Arc::new(Mutex::new(Store::open_desktop(&path).unwrap()));
    let window = window(cx);
    window
        .update(cx, move |board, window, cx| {
            board.store = store;
            board.refresh(cx);
            window.focus(&board.focus, cx);
        })
        .unwrap();
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    for _ in 0..25 {
        visual.simulate_keystrokes("down");
        visual.run_until_parked();
    }
    window
        .update(visual, |board, _, _| {
            assert_eq!(board.selected.as_deref(), Some("card-25"))
        })
        .unwrap();
    let selected = visual
        .debug_bounds("board-card-card-25")
        .expect("selected card is rendered");
    let list = visual.debug_bounds("board-list").unwrap();
    assert!(selected.top() >= list.top() && selected.bottom() <= list.bottom());
    visual.simulate_keystrokes("up");
    visual.run_until_parked();
    window
        .update(visual, |board, _, _| {
            assert_eq!(board.selected.as_deref(), Some("card-24"))
        })
        .unwrap();
    window
        .update(visual, |board, _, _| board.store = database())
        .unwrap();
    std::fs::remove_dir_all(directory).unwrap();
}
