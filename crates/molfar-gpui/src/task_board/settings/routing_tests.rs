use super::super::tests::window;
use super::tests::seed;
use gpui::{Focusable, TestAppContext, VisualTestContext};
use molfar_core::task_board::stage::agent::AgentStage;

#[gpui::test]
fn typed_keys_reach_settings_fields_and_escape_closes(cx: &mut TestAppContext) {
    let window = window(cx);
    seed(&window, cx);
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    window
        .update(visual, |board, window, cx| {
            let input = board.settings.as_ref().unwrap().skills[1].1.clone();
            window.focus(&input.read(cx).focus_handle(cx), cx);
        })
        .unwrap();

    visual.simulate_keystrokes("d - t d d");
    visual.run_until_parked();

    window
        .update(visual, |board, _, cx| {
            let text = board.settings.as_ref().unwrap().skills[1]
                .1
                .read(cx)
                .content
                .to_string();
            assert_eq!(text, "d-tdd");
        })
        .unwrap();
    window
        .update(visual, |board, window, cx| {
            window.focus(&board.settings.as_ref().unwrap().focus, cx)
        })
        .unwrap();
    visual.simulate_keystrokes("escape");
    visual.run_until_parked();
    window
        .update(visual, |board, _, _| assert!(board.settings.is_none()))
        .unwrap();
}

#[gpui::test]
fn settings_results_never_unlock_a_running_stage_action(cx: &mut TestAppContext) {
    let window = window(cx);
    seed(&window, cx);
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();

    window
        .update(visual, |board, _, cx| {
            board.stage_pending = Some("card".into());
            let input = board.settings.as_ref().unwrap().skills[0].1.clone();
            board.reset_stage_skills(AgentStage::Grill, cx);
            board.finish_settings_update(Some("Settings failed".into()), cx);
            assert_eq!(board.stage_pending.as_deref(), Some("card"));
            assert_eq!(
                board.settings.as_ref().unwrap().error.as_deref(),
                Some("Settings failed")
            );
            assert!(board.error.is_none());
            board.reset_stage_skills(AgentStage::Grill, cx);
            board.finish_settings_update(None, cx);
            assert_eq!(input.read(cx).content.as_ref(), "");
        })
        .unwrap();
}
