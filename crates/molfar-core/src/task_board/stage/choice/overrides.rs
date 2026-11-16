use super::{config::override_fields, constants::MAX_OVERRIDES};
use crate::task_board::stage::agent::AgentStage;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StageModelOverride {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub harness: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub effort: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub runtime_mode: Option<String>,
}

/// Merges a Retry override into the card's saved overrides for that stage.
/// Unrecognized saved entries are dropped, as the shipped Board does.
pub fn merge_retry_override(
    overrides_json: &str,
    stage: AgentStage,
    change: &StageModelOverride,
) -> Result<String, String> {
    let requested = serde_json::to_value(change).map_err(|e| e.to_string())?;
    let accepted = override_fields(&requested);
    if requested.as_object().map_or(0, Map::len) != accepted.len() {
        return Err("Invalid stage override.".into());
    }

    let saved: Value = serde_json::from_str(overrides_json).unwrap_or(Value::Null);
    let mut merged = Map::new();
    for entry in AgentStage::ALL {
        let mut fields = override_fields(&saved[entry.id()]);
        if entry == stage {
            fields.extend(accepted.clone());
        }
        if !fields.is_empty() {
            merged.insert(entry.id().into(), Value::Object(fields));
        }
    }

    let json = serde_json::to_string(&merged).map_err(|e| e.to_string())?;
    if json.len() > MAX_OVERRIDES {
        return Err("Invalid stage overrides.".into());
    }
    Ok(json)
}
