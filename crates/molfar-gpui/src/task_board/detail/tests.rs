use crate::task_board::{
    Board,
    settings::tests::click,
    tests::{card, window},
};
use gpui::{TestAppContext, VisualTestContext, WindowHandle};
use molfar_core::task_board::{
    constants::{BACKLOG, IDLE},
    types::Snapshot,
};

pub(super) fn show(cx: &mut TestAppContext, long: bool) -> WindowHandle<Board> {
    let window = window(cx);
    window
        .update(cx, |board, _, cx| {
            let mut first = card("first", BACKLOG);
            first.run_state = IDLE.into();
            first.description = if long {
                "# Heading\n\n- **Bold item**\n\n```rust\nlet answer = 42;\n```\n\n".repeat(20)
            } else {
                "**Short** description".into()
            };
            first.acceptance_criteria = "- Check behavior\n".repeat(if long { 30 } else { 1 });
            let mut second = card("second", BACKLOG);
            second.run_state = IDLE.into();
            board.selected = Some("first".into());
            board.drawer_open = true;
            board.finish(
                board.revision,
                Ok(Snapshot {
                    cards: vec![first, second],
                    selected: Some("first".into()),
                    ..Default::default()
                }),
                cx,
            );
        })
        .unwrap();
    window
}

#[gpui::test]
fn long_documents_fold_independently_and_keep_edit_actions_visible(cx: &mut TestAppContext) {
    let window = show(cx, true);
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    assert!(visual.debug_bounds("board-description-toggle").is_some());
    assert!(visual.debug_bounds("board-criteria-toggle").is_some());
    let drawer = visual.debug_bounds("board-detail-drawer").unwrap();
    let edit = visual.debug_bounds("board-edit-task").unwrap();
    assert!(drawer.contains(&edit.center()));
    let actions = visual.debug_bounds("board-detail-actions").unwrap();
    assert!(drawer.contains(&actions.center()));
    click(visual, "board-description-toggle");
    window
        .update(visual, |board, _, cx| {
            let content = board.detail_content.as_ref().unwrap();
            assert!(content.description_view.read(cx).expanded);
            assert!(!content.criteria_view.read(cx).expanded);
            let snapshot = board.snapshot.clone().unwrap();
            board.finish(board.revision, Ok(snapshot), cx);
        })
        .unwrap();
    visual.run_until_parked();
    window
        .update(visual, |board, _, cx| {
            assert!(
                board
                    .detail_content
                    .as_ref()
                    .unwrap()
                    .description_view
                    .read(cx)
                    .expanded
            );
            board.open_detail("second".into(), cx);
        })
        .unwrap();
    visual.run_until_parked();
    window
        .update(visual, |board, _, cx| {
            let content = board.detail_content.as_ref().unwrap();
            assert_eq!(content.card_id, "second");
            assert!(!content.description_view.read(cx).expanded);
        })
        .unwrap();
}

#[gpui::test]
fn short_markdown_needs_no_toggle_and_pending_metadata_hides_edit(cx: &mut TestAppContext) {
    let window = show(cx, false);
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    assert!(visual.debug_bounds("board-description-toggle").is_none());
    assert!(visual.debug_bounds("board-edit-task").is_some());
    window
        .update(visual, |board, _, cx| {
            board.selected = Some("second".into());
            cx.notify();
        })
        .unwrap();
    visual.run_until_parked();
    assert!(visual.debug_bounds("board-edit-task").is_none());
    assert!(
        visual
            .debug_bounds("board-detail-metadata-pending")
            .is_some()
    );
}

#[gpui::test]
fn an_old_preview_cannot_replace_a_reopened_card(cx: &mut TestAppContext) {
    let window = show(cx, false);
    window
        .update(cx, |board, _, cx| {
            board.sync_detail_content(cx);
            let content = board.detail_content.as_ref().unwrap();
            let old_view = content.description_view.entity_id();
            let old_generation = content.generation;
            board.selected = Some("second".into());
            board.sync_detail_content(cx);
            board.selected = Some("first".into());
            board.snapshot.as_mut().unwrap().cards[0].description = "Latest body".into();
            board.sync_detail_content(cx);
            let current_view = board
                .detail_content
                .as_ref()
                .unwrap()
                .description_view
                .clone();
            assert_ne!(old_view, current_view.entity_id());
            assert!(current_view.read(cx).preview.is_none());
            let stale = crate::notes::preview::Preview::new("Stale body", "/project", &board.store);
            let criteria =
                crate::notes::preview::Preview::new("Stale criteria", "/project", &board.store);
            board.finish_detail_content("first", old_generation, old_view, (stale, criteria), cx);
            assert!(current_view.read(cx).preview.is_none());
        })
        .unwrap();
}
