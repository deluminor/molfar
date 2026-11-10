use super::settings::{apply, SettingsPatch};
use crate::task_board::stage::agent::AgentStage;
use serde_json::{json, Value};

#[test]
fn effort_patch_sets_and_clears_only_the_effort() {
    let raw = json!({"columns":{"grill":{"harness":"claude","model":"claude:x","runtimeMode":"supervised"}}}).to_string();

    let set = apply(
        Some(&raw),
        &SettingsPatch::ColumnEffort(AgentStage::Grill, Some("high".into())),
    )
    .unwrap();
    let value: Value = serde_json::from_str(&set).unwrap();
    assert_eq!(
        value["columns"]["grill"],
        json!({"harness":"claude","model":"claude:x","effort":"high","runtimeMode":"supervised"})
    );

    let cleared = apply(
        Some(&set),
        &SettingsPatch::ColumnEffort(AgentStage::Grill, None),
    )
    .unwrap();
    assert_eq!(
        serde_json::from_str::<Value>(&cleared).unwrap(),
        serde_json::from_str::<Value>(&raw).unwrap()
    );

    assert!(apply(
        Some(&raw),
        &SettingsPatch::ColumnEffort(AgentStage::Implement, Some("high".into()))
    )
    .is_err());
    assert!(apply(
        Some(&raw),
        &SettingsPatch::ColumnEffort(AgentStage::Grill, Some(" ".into()))
    )
    .is_err());
}
