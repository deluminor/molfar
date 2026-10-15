use std::collections::BTreeMap;

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

use super::types::{RUNTIME_MODES, STAGES};
use super::validate::one_of;

const MAX_LABEL: usize = 200;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StageModelConfig {
    pub harness: String,
    pub model: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub effort: Option<String>,
    pub runtime_mode: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BoardSettings {
    #[serde(default)]
    pub columns: BTreeMap<String, StageModelConfig>,
    #[serde(default = "default_concurrency")]
    pub max_concurrent_stages: i64,
    #[serde(default = "default_stall_minutes")]
    pub stall_minutes: i64,
}

fn default_concurrency() -> i64 {
    3
}

fn default_stall_minutes() -> i64 {
    45
}

impl Default for BoardSettings {
    fn default() -> Self {
        Self {
            columns: BTreeMap::new(),
            max_concurrent_stages: default_concurrency(),
            stall_minutes: default_stall_minutes(),
        }
    }
}

pub(crate) fn validate_config(config: &StageModelConfig) -> Result<(), String> {
    let label = |value: &str| !value.trim().is_empty() && value.len() <= MAX_LABEL;
    if !label(&config.harness) || !label(&config.model) {
        return Err("Invalid stage model.".into());
    }
    one_of(&config.runtime_mode, &RUNTIME_MODES, "permission mode")?;
    if config.effort.as_ref().is_some_and(|effort| !label(effort)) {
        return Err("Invalid stage effort.".into());
    }
    Ok(())
}

fn validate(settings: &BoardSettings) -> Result<(), String> {
    if !(1..=10).contains(&settings.max_concurrent_stages) {
        return Err("Concurrent stages must be between 1 and 10.".into());
    }
    if !(1..=1_440).contains(&settings.stall_minutes) {
        return Err("Stall time must be between 1 and 1440 minutes.".into());
    }
    for (stage, config) in &settings.columns {
        one_of(stage, &STAGES, "column")?;
        validate_config(config)?;
    }
    Ok(())
}

pub(crate) fn get(conn: &Connection) -> Result<BoardSettings, String> {
    let raw: Option<String> = conn
        .query_row(
            "SELECT json FROM task_board_settings WHERE id = 1",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    let Some(raw) = raw else {
        return Ok(BoardSettings::default());
    };
    serde_json::from_str(&raw).map_err(|error| format!("Board settings are unreadable: {error}"))
}

pub(crate) fn set(conn: &Connection, settings: &BoardSettings) -> Result<BoardSettings, String> {
    validate(settings)?;
    let json = serde_json::to_string(settings).map_err(|error| error.to_string())?;
    conn.execute(
        "INSERT INTO task_board_settings (id, json) VALUES (1, ?1)
         ON CONFLICT(id) DO UPDATE SET json = excluded.json",
        params![json],
    )
    .map_err(|error| error.to_string())?;
    Ok(settings.clone())
}
