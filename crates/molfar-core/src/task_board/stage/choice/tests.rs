use super::{resolve, select};
use crate::task_board::stage::agent::AgentStage;
use crate::{
    agent::{AccessMode, Settings},
    catalog::Model,
    provider::Kind,
};
use serde_json::json;
use std::collections::HashSet;

fn model() -> Model {
    Model {
        id: "gpt-test".into(),
        name: "Test".into(),
        alias_target: None,
        efforts: vec!["low".into(), "high".into()],
        default_effort: Some("low".into()),
        fast: false,
        thinking: false,
        default: true,
        tiers: Vec::new(),
        controls: Vec::new(),
    }
}

#[test]
fn card_provider_override_drops_column_model_effort_and_preserves_fieldwise_mode() {
    let board = json!({"columns":{"grill":{"harness":"claude","model":"claude:old","effort":"max","runtimeMode":"supervised"}},"columnSkills":{"grill":[]}}).to_string();
    let selected = select(
        AgentStage::Grill,
        Some(&board),
        r#"{"grill":{"harness":"codex"}}"#,
        Kind::Claude,
    )
    .unwrap();
    assert_eq!(selected.kind, Kind::Codex);
    assert!(selected.input.get("model").is_none());
    assert!(selected.input.get("effort").is_none());
    let resolved = resolve(
        &selected,
        Settings::default(),
        &[model()],
        &HashSet::from(["d-plan".into()]),
        true,
    )
    .unwrap();
    assert_eq!(resolved.runtime_mode, "supervised");
    assert!(resolved.skills.is_empty());
    assert_eq!(resolved.model_settings, json!({"reasoningEffort":"low"}));
}

#[test]
fn defaults_use_auto_and_skill_slots_prefer_d_names_without_inventing_missing_skills() {
    let selected = select(AgentStage::Grill, None, "malformed override", Kind::Codex).unwrap();
    let available = HashSet::from([
        "plan".into(),
        "d-plan".into(),
        "grill-me".into(),
        "d-analyze".into(),
    ]);
    let resolved = resolve(
        &selected,
        Settings {
            access: AccessMode::FullAccess,
            ..Default::default()
        },
        &[model()],
        &available,
        true,
    )
    .unwrap();
    assert_eq!(resolved.runtime_mode, "auto");
    assert_eq!(resolved.skills, ["d-plan", "grill-me", "d-analyze"]);
    assert!(resolved.warnings.is_empty());
    assert!(resolve(
        &selected,
        Settings::default(),
        &[model()],
        &available,
        false
    )
    .is_err());
}

#[test]
fn unsupported_explicit_model_effort_or_column_mode_fails_instead_of_falling_back() {
    for overrides in [
        r#"{"grill":{"model":"codex:missing"}}"#,
        r#"{"grill":{"effort":"impossible"}}"#,
    ] {
        let selected = select(AgentStage::Grill, None, overrides, Kind::Codex).unwrap();
        assert!(resolve(
            &selected,
            Settings::default(),
            &[model()],
            &HashSet::new(),
            true
        )
        .is_err());
    }
    assert!(select(
        AgentStage::Grill,
        Some(r#"{"columns":{"grill":{"runtimeMode":"unsafe"}}}"#),
        "{}",
        Kind::Codex
    )
    .is_err());
    let selected = select(
        AgentStage::Grill,
        Some(r#"{"columnSkills":{"grill":["d-plan","missing","d-plan",""]}}"#),
        "{}",
        Kind::Codex,
    )
    .unwrap();
    let resolved = resolve(
        &selected,
        Settings::default(),
        &[model()],
        &HashSet::from(["d-plan".into()]),
        true,
    )
    .unwrap();
    assert_eq!(resolved.skills, ["d-plan"]);
    assert_eq!(resolved.warnings.len(), 1);
}
