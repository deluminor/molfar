use super::{
    Snapshot,
    tests::{card, window},
};
use gpui::{TestAppContext, VisualTestContext};

#[gpui::test]
fn metadata_refresh_keeps_board_content_mounted(cx: &mut TestAppContext) {
    let window = window(cx);
    window
        .update(cx, |board, _, cx| {
            let snapshot = Snapshot {
                cards: vec![card("first", "backlog"), card("next", "backlog")],
                selected: Some("first".into()),
                ..Default::default()
            };
            board.finish(board.revision, Ok(snapshot), cx);
            board.selected = Some("next".into());
            board.loading = true;
            cx.notify();
        })
        .unwrap();
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    assert!(
        visual.debug_bounds("board-list").is_some(),
        "refresh must not unmount the list"
    );
    assert!(visual.debug_bounds("board-card-next").is_some());
    assert!(visual.debug_bounds("board-detail").is_some());
    assert!(
        visual
            .debug_bounds("board-detail-metadata-pending")
            .is_some()
    );
}

#[gpui::test]
fn changing_current_project_discards_previous_project_results(cx: &mut TestAppContext) {
    let window = window(cx);
    window
        .update(cx, |board, _, cx| {
            board.set_context("/first".into(), vec!["/first".into(), "/next".into()]);
            board.project_only = true;
            board.finish(
                board.revision,
                Ok(Snapshot {
                    cards: vec![card("old", "backlog")],
                    selected: Some("old".into()),
                    ..Default::default()
                }),
                cx,
            );
            board.set_context("/next".into(), vec!["/first".into(), "/next".into()]);
            assert!(
                board.snapshot.is_none(),
                "old project results must not appear under the new project filter"
            );
        })
        .unwrap();
}

#[gpui::test]
fn successful_creation_invalidates_old_archived_filter_before_refresh(cx: &mut TestAppContext) {
    let window = window(cx);
    window
        .update(cx, |board, window, cx| {
            board.archived = true;
            board.finish(
                board.revision,
                Ok(Snapshot {
                    cards: vec![card("archived", "backlog")],
                    selected: Some("archived".into()),
                    ..Default::default()
                }),
                cx,
            );
            board.open_create(window, cx);
            let id = board.creation.as_ref().unwrap().id.clone();
            board.finish_create(&id, Ok(card("new", "backlog")), window, cx);
            assert!(!board.archived);
            assert!(
                board.snapshot.is_none(),
                "archived snapshot must not appear under active cards during refresh"
            );
        })
        .unwrap();
}
