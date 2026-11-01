use super::constants::{
    DEFAULT_RUNTIME_MODE, MAX_LABEL, MAX_SKILLS_PER_COLUMN, MAX_SKILL_NAME, RUNTIME_MODES,
};
use crate::task_board::stage::{
    agent::AgentStage,
    lifecycle::constants::{
        DEFAULT_CONCURRENCY, DEFAULT_STALL_MINUTES, MAX_CONCURRENCY, MAX_STALL_MINUTES,
        MIN_CONCURRENCY,
    },
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};

pub const COLUMNS: &str = "columns";
pub const COLUMN_SKILLS: &str = "columnSkills";
pub const MAX_CONCURRENT: &str = "maxConcurrentStages";
pub const STALL_MINUTES: &str = "stallMinutes";
pub const HARNESS: &str = "harness";
pub const MODEL: &str = "model";
const EFFORT: &str = "effort";
pub const RUNTIME_MODE: &str = "runtimeMode";

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StageModelConfig {
    pub harness: String,
    pub model: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub effort: Option<String>,
    pub runtime_mode: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum SettingsPatch {
    Column(AgentStage, Option<StageModelConfig>),
    ColumnModel {
        stage: AgentStage,
        harness: String,
        model: String,
    },
    ColumnMode(AgentStage, String),
    ColumnSkills(AgentStage, Option<Vec<String>>),
    Limits {
        max_concurrent: i64,
        stall_minutes: i64,
    },
}

fn label(value: &str) -> bool {
    !value.trim().is_empty() && value.len() <= MAX_LABEL
}

fn validate_config(value: &Value) -> Result<(), String> {
    let config: StageModelConfig =
        serde_json::from_value(value.clone()).map_err(|_| "Invalid stage model.".to_owned())?;
    if !label(&config.harness) || !label(&config.model) {
        return Err("Invalid stage model.".into());
    }
    if !RUNTIME_MODES.contains(&config.runtime_mode.as_str()) {
        return Err(format!("Invalid permission mode: {}", config.runtime_mode));
    }
    if config
        .effort
        .as_deref()
        .is_some_and(|effort| !label(effort))
    {
        return Err("Invalid stage effort.".into());
    }
    Ok(())
}

fn valid_skill_name(name: &str) -> bool {
    let bytes = name.as_bytes();
    let allowed = |byte: &u8| byte.is_ascii_lowercase() || byte.is_ascii_digit();
    !name.is_empty()
        && name.len() <= MAX_SKILL_NAME
        && bytes.first().is_some_and(allowed)
        && bytes.last().is_some_and(allowed)
        && bytes.iter().all(|byte| allowed(byte) || *byte == b'-')
        && !name.contains("--")
}

fn validate_skills(value: &Value) -> Result<(), String> {
    let skills = value.as_array().ok_or("Column skills must be a list.")?;
    if skills.len() > MAX_SKILLS_PER_COLUMN {
        return Err("Too many skills for one column.".into());
    }
    for skill in skills {
        let name = skill.as_str().unwrap_or_default();
        if !valid_skill_name(name) {
            return Err(format!("Invalid skill name: {name}"));
        }
    }
    Ok(())
}

fn validate_stage_map(
    settings: &Map<String, Value>,
    key: &str,
    check: fn(&Value) -> Result<(), String>,
) -> Result<(), String> {
    let Some(value) = settings.get(key) else {
        return Ok(());
    };
    let entries = value
        .as_object()
        .ok_or_else(|| format!("{key} must be an object."))?;
    for (stage, entry) in entries {
        AgentStage::parse(stage).ok_or_else(|| format!("Invalid column: {stage}"))?;
        check(entry)?;
    }
    Ok(())
}

fn limit(
    settings: &Map<String, Value>,
    key: &str,
    default: i64,
    range: std::ops::RangeInclusive<i64>,
    message: &str,
) -> Result<(), String> {
    let value = settings.get(key).map_or(Some(default), Value::as_i64);
    match value {
        Some(value) if range.contains(&value) => Ok(()),
        _ => Err(message.into()),
    }
}

fn validate(settings: &Map<String, Value>) -> Result<(), String> {
    limit(
        settings,
        MAX_CONCURRENT,
        DEFAULT_CONCURRENCY,
        MIN_CONCURRENCY..=MAX_CONCURRENCY,
        "Concurrent stages must be between 1 and 10.",
    )?;
    let stall = i64::try_from(MAX_STALL_MINUTES).map_err(|e| e.to_string())?;
    let default_stall = i64::try_from(DEFAULT_STALL_MINUTES).map_err(|e| e.to_string())?;
    limit(
        settings,
        STALL_MINUTES,
        default_stall,
        1..=stall,
        "Stall time must be between 1 and 1440 minutes.",
    )?;
    validate_stage_map(settings, COLUMNS, validate_config)?;
    validate_stage_map(settings, COLUMN_SKILLS, validate_skills)
}

fn stage_entry(settings: &Map<String, Value>, stage: AgentStage) -> Option<Value> {
    settings.get(COLUMNS)?.get(stage.id()).cloned()
}

fn set_stage_entry(
    settings: &mut Map<String, Value>,
    key: &str,
    stage: AgentStage,
    value: Option<Value>,
) {
    let entries = settings.entry(key).or_insert_with(|| json!({}));
    let Some(entries) = entries.as_object_mut() else {
        return;
    };
    match value {
        Some(value) => entries.insert(stage.id().into(), value),
        None => entries.remove(stage.id()),
    };
}

/// Applies one field-level change to the shared Board settings JSON, keeping keys
/// this client does not understand. Unreadable existing settings are refused.
pub fn apply(raw: Option<&str>, patch: &SettingsPatch) -> Result<String, String> {
    let mut settings = match raw {
        Some(raw) => match serde_json::from_str::<Value>(raw) {
            Ok(Value::Object(settings)) => settings,
            _ => return Err("Board settings are unreadable.".into()),
        },
        None => Map::new(),
    };
    validate(&settings).map_err(|error| format!("Board settings are unreadable: {error}"))?;

    match patch {
        SettingsPatch::Column(stage, config) => {
            let value = config
                .as_ref()
                .map(serde_json::to_value)
                .transpose()
                .map_err(|e| e.to_string())?;
            set_stage_entry(&mut settings, COLUMNS, *stage, value);
        }
        SettingsPatch::ColumnModel {
            stage,
            harness,
            model,
        } => {
            let mut column = stage_entry(&settings, *stage)
                .unwrap_or_else(|| json!({ RUNTIME_MODE: DEFAULT_RUNTIME_MODE }));
            column[HARNESS] = json!(harness);
            column[MODEL] = json!(model);
            if let Some(fields) = column.as_object_mut() {
                fields.remove(EFFORT);
            }
            set_stage_entry(&mut settings, COLUMNS, *stage, Some(column));
        }
        SettingsPatch::ColumnMode(stage, mode) => {
            let mut column = stage_entry(&settings, *stage)
                .ok_or("Pick a model for this stage before changing its access.")?;
            column[RUNTIME_MODE] = json!(mode);
            set_stage_entry(&mut settings, COLUMNS, *stage, Some(column));
        }
        SettingsPatch::ColumnSkills(stage, skills) => {
            set_stage_entry(
                &mut settings,
                COLUMN_SKILLS,
                *stage,
                skills.as_ref().map(|skills| json!(skills)),
            );
        }
        SettingsPatch::Limits {
            max_concurrent,
            stall_minutes,
        } => {
            settings.insert(MAX_CONCURRENT.into(), json!(max_concurrent));
            settings.insert(STALL_MINUTES.into(), json!(stall_minutes));
        }
    }

    validate(&settings)?;
    serde_json::to_string(&settings).map_err(|e| e.to_string())
}
