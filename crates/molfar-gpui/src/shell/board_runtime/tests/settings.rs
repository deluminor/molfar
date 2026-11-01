use super::{super::*, fixtures::*};
use gpui::TestAppContext;
use molfar_core::task_board::stage::{
    agent::AgentStage,
    choice::settings::{SettingsPatch, StageModelConfig},
    lifecycle::types::StageAction,
};

#[gpui::test]
fn unavailable_saved_model_fails_the_claim_without_run_or_session(cx: &mut TestAppContext) {
    let fixture = Fixture::new();
    let window = fixture.window(cx);
    let config = StageModelConfig {
        harness: "codex".into(),
        model: "codex:missing".into(),
        effort: None,
        runtime_mode: "auto".into(),
    };
    window
        .update(cx, |shell, _, cx| {
            shell.board_update_settings(SettingsPatch::Column(AgentStage::Grill, Some(config)), cx);
        })
        .unwrap();
    cx.run_until_parked();
    assert!(
        locked(&fixture.store)
            .unwrap()
            .board_settings_json()
            .unwrap()
            .unwrap()
            .contains("codex:missing")
    );

    window
        .update(cx, |shell, _, cx| {
            shell.board_action(
                "card".into(),
                fixture.card().updated_at,
                StageAction::Start,
                cx,
            );
        })
        .unwrap();
    wait_until(cx, || fixture.card().run_state == "failed");

    let card = fixture.card();
    let snapshot = locked(&fixture.store)
        .unwrap()
        .board_snapshot(None, false, Some("card"))
        .unwrap();
    assert!(
        card.last_error
            .unwrap_or_default()
            .contains("Unknown model")
    );
    assert!(snapshot.runs.is_empty());
    assert!(
        locked(&fixture.store)
            .unwrap()
            .board_owned_session_ids()
            .unwrap()
            .is_empty()
    );
    assert!(!fixture.root.join("submissions").exists());
}
