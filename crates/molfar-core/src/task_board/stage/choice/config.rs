use super::{
    constants::{CONFIG_FIELDS, DEFAULT_RUNTIME_MODE, RUNTIME_MODES},
    types::StageSelection,
};
use crate::{provider::Kind, task_board::stage::agent::AgentStage};
use serde_json::{json, Map, Value};

pub(crate) fn is_runtime_mode(value: &str) -> bool {
    RUNTIME_MODES.contains(&value)
}

pub(super) fn override_fields(value: &Value) -> Map<String, Value> {
    let mut result = Map::new();
    for key in CONFIG_FIELDS {
        let Some(text) = value[key]
            .as_str()
            .map(str::trim)
            .filter(|text| !text.is_empty())
        else {
            continue;
        };
        if key == "harness" && Kind::parse(text).is_none() {
            continue;
        }
        if key == "runtimeMode" && !is_runtime_mode(text) {
            continue;
        }
        result.insert(key.into(), json!(text));
    }
    result
}

pub(super) fn selection(
    stage: AgentStage,
    settings: Option<&str>,
    overrides: &str,
    default_kind: Kind,
) -> Result<StageSelection, String> {
    let board: Value = settings
        .map(|text| {
            serde_json::from_str(text).map_err(|error| format!("Invalid Board settings: {error}"))
        })
        .transpose()?
        .unwrap_or_else(|| json!({}));
    if !board.is_object() {
        return Err("Board settings must be an object.".into());
    }
    let column = &board["columns"][stage.id()];
    let mut input = match column {
        Value::Null => Map::new(),
        Value::Object(fields) => fields
            .iter()
            .filter(|(key, _)| CONFIG_FIELDS.contains(&key.as_str()))
            .map(|(key, value)| (key.clone(), value.clone()))
            .collect(),
        _ => return Err(format!("{} configuration must be an object.", stage.id())),
    };
    let overrides: Value = serde_json::from_str(overrides).unwrap_or(Value::Null);
    let card = override_fields(&overrides[stage.id()]);
    if card
        .get("harness")
        .is_some_and(|harness| Some(harness) != input.get("harness"))
    {
        input.remove("model");
        input.remove("effort");
    }
    input.extend(card);
    for (key, max) in [
        ("harness", 400),
        ("model", 400),
        ("effort", 128),
        ("runtimeMode", 400),
    ] {
        if let Some(value) = input.get_mut(key) {
            let text = value
                .as_str()
                .map(str::trim)
                .filter(|text| !text.is_empty() && text.len() <= max)
                .ok_or_else(|| format!("{key} must be text under {max} bytes."))?;
            *value = json!(text);
        }
    }
    let kind = input
        .get("harness")
        .and_then(Value::as_str)
        .map(|id| Kind::parse(id).ok_or_else(|| format!("{id} is not available in MOLFAR")))
        .transpose()?
        .unwrap_or(default_kind);
    let mode = input
        .get("runtimeMode")
        .and_then(Value::as_str)
        .unwrap_or(DEFAULT_RUNTIME_MODE);
    if !is_runtime_mode(mode) {
        return Err("Unsupported Board runtime mode.".into());
    }
    input.insert("runtimeMode".into(), json!(mode));
    input.insert("harness".into(), json!(kind.id()));
    let configured_skills = board
        .get("columnSkills")
        .and_then(|value| value.get(stage.id()))
        .map(|value| {
            value
                .as_array()
                .ok_or_else(|| format!("{} skills must be an array.", stage.id()))?
                .iter()
                .map(|name| {
                    name.as_str()
                        .map(str::to_owned)
                        .ok_or_else(|| format!("{} skill names must be strings.", stage.id()))
                })
                .collect::<Result<Vec<_>, _>>()
        })
        .transpose()?;
    Ok(StageSelection {
        stage,
        kind,
        default_kind,
        input: Value::Object(input),
        configured_skills,
    })
}
