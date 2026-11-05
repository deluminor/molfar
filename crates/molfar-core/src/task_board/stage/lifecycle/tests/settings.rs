use super::fixtures::fixture;
use crate::{
    store::{desktop_model_id, native_model},
    task_board::stage::{
        agent::AgentStage,
        choice::settings::{SettingsPatch, StageModelConfig},
    },
};
use rusqlite::Connection;

#[test]
fn board_settings_update_round_trips_and_refuses_unreadable_rows() {
    let (directory, mut store) = fixture();
    let model = desktop_model_id(Some("claude-sonnet-4"), "claude");
    let config = StageModelConfig {
        harness: "claude".into(),
        model: model.clone(),
        effort: None,
        runtime_mode: "supervised".into(),
    };

    store
        .board_update_settings(&SettingsPatch::Column(AgentStage::Grill, Some(config)))
        .unwrap();
    let saved = store.board_settings_json().unwrap().unwrap();

    assert!(saved.contains(r#""model":"claude:sonnet-4""#), "{saved}");
    assert_eq!(
        native_model(&model, "claude").as_deref(),
        Some("claude-sonnet-4")
    );
    Connection::open(directory.path().join("molfar.db"))
        .unwrap()
        .execute(
            "UPDATE task_board_settings SET json='broken' WHERE id=1",
            [],
        )
        .unwrap();
    let limits = SettingsPatch::Limits {
        max_concurrent: 2,
        stall_minutes: 10,
    };
    assert!(store.board_update_settings(&limits).is_err());
    assert_eq!(
        store.board_settings_json().unwrap().as_deref(),
        Some("broken")
    );
}

#[test]
fn accepted_run_freezes_desktop_model_and_survives_later_edits() {
    let (_directory, mut store) = super::fixtures::fixture();
    let context = super::fixtures::accept(&mut store, "run-one");

    let edited = StageModelConfig {
        harness: "claude".into(),
        model: "claude:opus".into(),
        effort: None,
        runtime_mode: "supervised".into(),
    };
    store
        .board_update_settings(&SettingsPatch::Column(AgentStage::Grill, Some(edited)))
        .unwrap();
    let run = store
        .board_snapshot(None, false, Some("card"))
        .unwrap()
        .runs
        .remove(0);

    assert_eq!(context.run.model, "codex:test-model");
    assert_eq!(run.model, "codex:test-model");
    assert_eq!(
        (run.harness.as_str(), run.runtime_mode.as_str()),
        ("codex", "auto")
    );
    assert_eq!(
        run.template_version,
        crate::task_board::stage::contracts::constants::TEMPLATE_VERSION
    );
}
