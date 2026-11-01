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
