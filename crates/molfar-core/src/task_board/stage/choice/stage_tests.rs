use super::{resolve, select};
use crate::{
    agent::Settings, catalog::Model, provider::Kind, task_board::stage::agent::AgentStage,
};
use serde_json::json;
use std::collections::HashSet;

fn model(id: &str) -> Model {
    Model {
        id: id.into(),
        name: id.into(),
        alias_target: None,
        efforts: Vec::new(),
        default_effort: None,
        fast: false,
        thinking: false,
        default: true,
        tiers: Vec::new(),
        controls: Vec::new(),
    }
}

#[test]
fn every_stage_reads_its_own_column_and_card_override() {
    for stage in AgentStage::ALL {
        let id = stage.id();
        let board = json!({"columns":{id:{"harness":"claude","model":"claude:old","effort":"max","runtimeMode":"supervised"}}}).to_string();
        let overrides = json!({id:{"harness":"codex","runtimeMode":"full-access"}, "unknown":{"harness":"claude"}}).to_string();

        let selected = select(stage, Some(&board), &overrides, Kind::Claude).unwrap();

        assert_eq!(selected.stage, stage);
        assert_eq!(selected.kind, Kind::Codex, "{id}");
        assert!(selected.input.get("model").is_none(), "{id}");
        assert!(selected.input.get("effort").is_none(), "{id}");
        assert_eq!(selected.input["runtimeMode"], "full-access", "{id}");
    }
}

#[test]
fn other_stage_configuration_never_leaks() {
    let board = json!({"columns":{"implement":{"harness":"claude"}},"columnSkills":{"implement":["d-tdd"]}}).to_string();

    let selected = select(
        AgentStage::Grill,
        Some(&board),
        r#"{"implement":{"model":"x"}}"#,
        Kind::Codex,
    )
    .unwrap();

    assert_eq!(selected.kind, Kind::Codex);
    assert!(selected.input.get("model").is_none());
    assert!(selected.configured_skills.is_none());
}

#[test]
fn unset_stage_uses_project_default_and_auto() {
    for stage in AgentStage::ALL {
        let selected = select(stage, None, "{}", Kind::Codex).unwrap();

        assert_eq!(selected.kind, Kind::Codex);
        assert_eq!(selected.input["runtimeMode"], "auto");
    }
}

#[test]
fn default_skill_slots_follow_the_stage() {
    let available: HashSet<String> = [
        "d-plan",
        "grill-me",
        "d-analyze",
        "tdd",
        "d-verify",
        "d-lean-code",
        "d-code-review",
        "security-review",
        "d-merge-request-writer",
    ]
    .into_iter()
    .map(Into::into)
    .collect();
    let expected = [
        (AgentStage::Grill, vec!["d-plan", "grill-me", "d-analyze"]),
        (
            AgentStage::Implement,
            vec!["tdd", "d-verify", "d-lean-code"],
        ),
        (
            AgentStage::CodeReview,
            vec!["d-code-review", "security-review", "d-merge-request-writer"],
        ),
        (AgentStage::Rework, vec!["tdd", "d-verify", "d-lean-code"]),
    ];

    for (stage, skills) in expected {
        let selected = select(stage, None, "{}", Kind::Codex).unwrap();
        let resolved = resolve(
            &selected,
            Settings::default(),
            &[model("m")],
            &available,
            true,
        )
        .unwrap();

        assert_eq!(resolved.skills, skills, "{}", stage.id());
    }
}

#[test]
fn explicit_empty_skills_and_unavailable_choices_hold_for_every_stage() {
    for stage in AgentStage::ALL {
        let id = stage.id();
        let board = json!({"columnSkills":{id:[]}}).to_string();
        let selected = select(stage, Some(&board), "{}", Kind::Codex).unwrap();
        let available = HashSet::from(["d-tdd".to_owned(), "d-plan".to_owned()]);

        let resolved = resolve(
            &selected,
            Settings::default(),
            &[model("m")],
            &available,
            true,
        )
        .unwrap();

        assert!(resolved.skills.is_empty(), "{id}");
        assert!(
            resolve(&selected, Settings::default(), &[], &available, true).is_err(),
            "{id}"
        );
        assert!(
            resolve(
                &selected,
                Settings::default(),
                &[model("m")],
                &available,
                false
            )
            .is_err(),
            "{id}"
        );
        let missing = json!({id:{"model":"codex:missing"}}).to_string();
        let selected = select(stage, None, &missing, Kind::Codex).unwrap();
        assert!(
            resolve(
                &selected,
                Settings::default(),
                &[model("m")],
                &available,
                true
            )
            .is_err(),
            "{id}"
        );
    }
}
