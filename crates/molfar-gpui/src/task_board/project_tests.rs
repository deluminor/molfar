use super::{
    Board,
    settings::tests::click,
    tests::{card, window},
};
use crate::popover::MenuEvent;
use gpui::{AppContext, TestAppContext, VisualTestContext};
use molfar_core::task_board::{
    constants::{BACKLOG, IDLE},
    types::Snapshot,
};

#[gpui::test]
fn project_menu_selects_a_project_and_rejects_stale_filter_results(cx: &mut TestAppContext) {
    cx.update(crate::popover::bind);
    let window = window(cx);
    window
        .update(cx, |board, _, cx| {
            board.set_context("/alpha".into(), vec!["/alpha".into(), "/beta".into()]);
            board.finish(board.revision, Ok(Snapshot::default()), cx);
        })
        .unwrap();
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    let header_button = visual.debug_bounds("board-project-filter").unwrap();
    assert_eq!(header_button.size.height, gpui::px(28.));
    click(visual, "board-project-filter");
    let stale = window
        .update(visual, |board, window, cx| {
            let stale = board.revision;
            let menu = board.project_menu.clone().unwrap();
            menu.update(cx, |menu, cx| {
                menu.finish(MenuEvent::Picked("/beta".into(), None), window, cx)
            });
            stale
        })
        .unwrap();
    visual.run_until_parked();
    window
        .update(visual, |board, _, cx| {
            assert_eq!(board.project_filter.as_deref(), Some("/beta"));
            assert!(board.project_menu.is_none());
            board.finish(
                stale,
                Ok(Snapshot {
                    cards: vec![card("old", BACKLOG)],
                    ..Default::default()
                }),
                cx,
            );
            assert!(board.snapshot.as_ref().is_none_or(|s| s.cards.is_empty()));
        })
        .unwrap();
    click(visual, "board-project-filter");
    visual.simulate_keystrokes("escape");
    visual.run_until_parked();
    window
        .update(visual, |board, _, _| {
            assert!(board.project_menu.is_none());
            assert_eq!(board.project_filter.as_deref(), Some("/beta"));
        })
        .unwrap();
    click(visual, "board-project-filter");
    window
        .update(visual, |board, window, cx| {
            let menu = board.project_menu.clone().unwrap();
            menu.update(cx, |menu, cx| {
                menu.finish(MenuEvent::Picked("".into(), None), window, cx)
            });
        })
        .unwrap();
    visual.run_until_parked();
    window
        .update(visual, |board, _, _| {
            assert!(board.project_filter.is_none())
        })
        .unwrap();
}

#[gpui::test]
fn removed_project_invalidates_filter_and_late_results(cx: &mut TestAppContext) {
    let board = cx.new(|cx| Board::new(super::tests::database(), cx));
    board.update(cx, |board, cx| {
        board.cwd = "/alpha".into();
        board.project_filter = Some("/beta".into());
        let revision = board.revision;
        board.set_context("/alpha".into(), vec!["/alpha".into()]);
        assert!(board.project_filter.is_none());
        let mut waiting = card("waiting", BACKLOG);
        waiting.run_state = IDLE.into();
        board.finish(
            revision,
            Ok(Snapshot {
                cards: vec![waiting],
                ..Default::default()
            }),
            cx,
        );
        assert!(board.snapshot.is_none());
    });
}

#[gpui::test]
fn external_reveal_clears_project_filter_and_inline_reader(cx: &mut TestAppContext) {
    let window = window(cx);
    window
        .update(cx, |board, _, cx| {
            board.project_filter = Some("/alpha".into());
            board.detail_tab = Some("plan".into());
            board.detail_version = Some(2);
            let revision = board.artifact_revision;
            board.reveal_card("external".into(), cx);
            assert!(board.project_filter.is_none());
            assert!(board.detail_tab.is_none());
            assert!(board.detail_version.is_none());
            assert!(board.artifact_revision > revision);
        })
        .unwrap();
}
