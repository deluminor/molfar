use super::settings::{apply, SettingsPatch, StageModelConfig};
use crate::task_board::stage::agent::AgentStage;
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::BTreeMap;

#[allow(dead_code)]
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SourceConfig {
    harness: String,
    model: String,
    #[serde(default)]
    effort: Option<String>,
    runtime_mode: String,
}

#[allow(dead_code)]
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SourceSettings {
    #[serde(default)]
    columns: BTreeMap<String, SourceConfig>,
    #[serde(default)]
    column_skills: BTreeMap<String, Vec<String>>,
    #[serde(default)]
    max_concurrent_stages: Option<i64>,
    #[serde(default)]
    stall_minutes: Option<i64>,
}

fn config() -> StageModelConfig {
    StageModelConfig {
        harness: "codex".into(),
        model: "codex:gpt-5".into(),
        effort: Some("high".into()),
        runtime_mode: "auto".into(),
    }
}

#[test]
fn column_patch_preserves_unknown_keys_and_other_columns() {
    let raw = json!({"columns":{"grill":{"harness":"claude","model":"claude:x","runtimeMode":"auto"}},"future":{"keep":true},"stallMinutes":30}).to_string();

    let written = apply(
        Some(&raw),
        &SettingsPatch::Column(AgentStage::Implement, Some(config())),
    )
    .unwrap();
    let value: Value = serde_json::from_str(&written).unwrap();

    assert_eq!(value["future"], json!({"keep":true}));
    assert_eq!(value["stallMinutes"], 30);
    assert_eq!(value["columns"]["grill"]["model"], "claude:x");
    assert_eq!(
        value["columns"]["implement"],
        json!({"harness":"codex","model":"codex:gpt-5","effort":"high","runtimeMode":"auto"})
    );
    let unset = apply(
        Some(&written),
        &SettingsPatch::Column(AgentStage::Implement, None),
    )
    .unwrap();
    assert!(serde_json::from_str::<Value>(&unset).unwrap()["columns"]
        .get("implement")
        .is_none());
}

#[test]
fn written_settings_deserialize_as_source_struct() {
    let mut raw = None;
    for patch in [
        SettingsPatch::Column(
            AgentStage::Grill,
            Some(StageModelConfig {
                effort: None,
                ..config()
            }),
        ),
        SettingsPatch::ColumnSkills(AgentStage::CodeReview, Some(vec!["d-code-review".into()])),
        SettingsPatch::Limits {
            max_concurrent: 4,
            stall_minutes: 90,
        },
    ] {
        raw = Some(apply(raw.as_deref(), &patch).unwrap());
    }

    let parsed: SourceSettings = serde_json::from_str(raw.as_deref().unwrap()).unwrap();

    assert_eq!(parsed.columns["grill"].effort, None);
    assert_eq!(parsed.column_skills["code_review"], ["d-code-review"]);
}

#[test]
fn skills_patch_is_explicit_and_reset_removes_the_key() {
    let explicit = apply(
        None,
        &SettingsPatch::ColumnSkills(AgentStage::Grill, Some(Vec::new())),
    )
    .unwrap();
    let value: Value = serde_json::from_str(&explicit).unwrap();
    assert_eq!(value["columnSkills"]["grill"], json!([]));

    let reset = apply(
        Some(&explicit),
        &SettingsPatch::ColumnSkills(AgentStage::Grill, None),
    )
    .unwrap();

    assert!(
        serde_json::from_str::<Value>(&reset).unwrap()["columnSkills"]
            .get("grill")
            .is_none()
    );
}

#[test]
fn settings_validation_matches_source() {
    let long = "x".repeat(201);
    let invalid = [
        SettingsPatch::Limits {
            max_concurrent: 0,
            stall_minutes: 45,
        },
        SettingsPatch::Limits {
            max_concurrent: 11,
            stall_minutes: 45,
        },
        SettingsPatch::Limits {
            max_concurrent: 3,
            stall_minutes: 0,
        },
        SettingsPatch::Limits {
            max_concurrent: 3,
            stall_minutes: 1441,
        },
        SettingsPatch::Column(
            AgentStage::Grill,
            Some(StageModelConfig {
                model: " ".into(),
                ..config()
            }),
        ),
        SettingsPatch::Column(
            AgentStage::Grill,
            Some(StageModelConfig {
                harness: long.clone(),
                ..config()
            }),
        ),
        SettingsPatch::Column(
            AgentStage::Grill,
            Some(StageModelConfig {
                runtime_mode: "read-only".into(),
                ..config()
            }),
        ),
        SettingsPatch::Column(
            AgentStage::Grill,
            Some(StageModelConfig {
                effort: Some(long),
                ..config()
            }),
        ),
        SettingsPatch::ColumnSkills(AgentStage::Grill, Some(vec!["Bad_Name".into()])),
        SettingsPatch::ColumnSkills(AgentStage::Grill, Some(vec!["a--b".into()])),
        SettingsPatch::ColumnSkills(AgentStage::Grill, Some(vec!["x".into(); 33])),
    ];

    for patch in invalid {
        assert!(apply(None, &patch).is_err(), "{patch:?}");
    }
    assert!(apply(
        None,
        &SettingsPatch::Limits {
            max_concurrent: 10,
            stall_minutes: 1440
        }
    )
    .is_ok());
}

#[test]
fn unreadable_settings_are_never_overwritten() {
    let patch = SettingsPatch::Limits {
        max_concurrent: 3,
        stall_minutes: 45,
    };

    for raw in [
        "not json",
        "[]",
        r#"{"columns":{"grill":{"harness":"codex"}}}"#,
        r#"{"columns":{"nope":{}}}"#,
    ] {
        assert!(apply(Some(raw), &patch).is_err(), "{raw}");
    }
}
