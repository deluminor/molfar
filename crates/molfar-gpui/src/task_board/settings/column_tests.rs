use super::{
    super::tests::window,
    tests::{record, seed},
};
use gpui::{TestAppContext, VisualTestContext};
use molfar_core::task_board::stage::agent::AgentStage;

#[gpui::test]
fn column_settings_are_anchored_and_escape_closes(cx: &mut TestAppContext) {
    let window = window(cx);
    window
        .update(cx, |board, _, cx| {
            board.finish(board.revision, Ok(Default::default()), cx);
        })
        .unwrap();
    seed(&window, cx);
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    window
        .update(visual, |board, window, cx| {
            board.close_settings(window, cx);
            board.open_column_settings(AgentStage::Grill, window, cx);
        })
        .unwrap();
    visual.run_until_parked();
    assert!(visual.debug_bounds("board-column-settings").is_some());
    assert!(visual.debug_bounds("board-settings-dialog").is_none());
    assert!(visual.debug_bounds("board-column-settings-model").is_some());
    window
        .update(visual, |board, _, _| {
            assert!(board.picker.is_none());
            assert_eq!(
                board.settings.as_ref().unwrap().column,
                Some(AgentStage::Grill)
            );
        })
        .unwrap();
    visual.simulate_keystrokes("escape");
    visual.run_until_parked();
    window
        .update(visual, |board, _, _| assert!(board.settings.is_none()))
        .unwrap();
}

#[gpui::test]
fn column_skill_checkbox_keeps_empty_custom_list_and_blocks_duplicate_save(
    cx: &mut TestAppContext,
) {
    let window = window(cx);
    let events = record(&window, cx);
    seed(&window, cx);
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    window
        .update(visual, |board, _, cx| {
            board.settings.as_mut().unwrap().column = Some(AgentStage::Grill);
            board.toggle_column_skill(AgentStage::Grill, "d-plan", cx);
            board.toggle_column_skill(AgentStage::Grill, "d-plan", cx);
            assert_eq!(
                board.settings.as_ref().unwrap().skills[0]
                    .1
                    .read(cx)
                    .content
                    .as_ref(),
                ""
            );
        })
        .unwrap();
    assert_eq!(*events.borrow(), ["ColumnSkills(Grill, Some([]))"]);
}

#[gpui::test]
fn column_skill_failure_stays_in_settings_and_does_not_unlock_stage(cx: &mut TestAppContext) {
    let window = window(cx);
    seed(&window, cx);
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    window
        .update(visual, |board, _, cx| {
            board.settings.as_mut().unwrap().column = Some(AgentStage::Grill);
            board.stage_pending = Some("running-card".into());
            board.toggle_column_skill(AgentStage::Grill, "d-plan", cx);
            board.finish_settings_update(Some("Could not save skills".into()), cx);
            assert_eq!(
                board.settings.as_ref().unwrap().error.as_deref(),
                Some("Could not save skills")
            );
            assert_eq!(board.stage_pending.as_deref(), Some("running-card"));
        })
        .unwrap();
}

#[gpui::test]
fn nested_model_search_escape_restores_column_focus_then_closes(cx: &mut TestAppContext) {
    let window = window(cx);
    window
        .update(cx, |board, _, cx| {
            board.finish(board.revision, Ok(Default::default()), cx);
        })
        .unwrap();
    seed(&window, cx);
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    window
        .update(visual, |board, window, cx| {
            board.open_column_settings(AgentStage::Grill, window, cx);
        })
        .unwrap();
    visual.run_until_parked();
    super::tests::click(visual, "board-column-settings-model");
    window
        .update(visual, |board, window, cx| {
            let focus = board
                .picker
                .as_ref()
                .unwrap()
                .list
                .read(cx)
                .search_focus(cx);
            assert!(focus.is_focused(window));
        })
        .unwrap();
    visual.simulate_keystrokes("escape");
    visual.run_until_parked();
    window
        .update(visual, |board, window, _| {
            assert!(board.picker.is_none());
            assert!(board.settings.as_ref().unwrap().focus.is_focused(window));
        })
        .unwrap();
    visual.simulate_keystrokes("escape");
    visual.run_until_parked();
    window
        .update(visual, |board, _, _| assert!(board.settings.is_none()))
        .unwrap();
}

#[gpui::test]
fn reopened_column_rejects_previous_catalog_result(cx: &mut TestAppContext) {
    let window = window(cx);
    seed(&window, cx);
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    window
        .update(visual, |board, window, cx| {
            let old_focus = board.settings.as_ref().unwrap().focus.clone();
            board.close_settings(window, cx);
            board.open_settings(window, cx);
            board.settings.as_mut().unwrap().column = Some(AgentStage::Grill);
            board.finish_column_skills(AgentStage::Grill, &old_focus, Ok(vec!["stale".into()]), cx);
            board.finish_column_skills(
                AgentStage::Grill,
                &old_focus,
                Err("old failure".into()),
                cx,
            );
            let panel = board.settings.as_ref().unwrap();
            assert!(panel.catalog.is_empty());
            assert!(panel.catalog_error.is_none());
        })
        .unwrap();
}

#[gpui::test]
fn checkbox_ack_keeps_pending_until_saved_snapshot_reload(cx: &mut TestAppContext) {
    let window = window(cx);
    let events = record(&window, cx);
    seed(&window, cx);
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    window
        .update(visual, |board, _, cx| {
            board.settings.as_mut().unwrap().column = Some(AgentStage::Grill);
            board.toggle_column_skill(AgentStage::Grill, "d-verify", cx);
            let patch = board.settings.as_ref().unwrap().pending.clone().unwrap();
            crate::runtime::locked(&board.store)
                .unwrap()
                .board_update_settings(&patch)
                .unwrap();
            board.finish_settings_update(None, cx);
            board.toggle_column_skill(AgentStage::Grill, "d-lean-code", cx);
            assert!(board.settings.as_ref().unwrap().pending.is_some());
        })
        .unwrap();
    assert_eq!(events.borrow().len(), 1);
    visual.run_until_parked();
    window
        .update(visual, |board, _, cx| {
            assert!(board.settings.as_ref().unwrap().pending.is_none());
            board.toggle_column_skill(AgentStage::Grill, "d-lean-code", cx);
        })
        .unwrap();
    assert_eq!(
        events.borrow()[1],
        "ColumnSkills(Grill, Some([\"d-plan\", \"d-verify\", \"d-lean-code\"]))"
    );
}
