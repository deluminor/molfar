use serde::{de::DeserializeOwned, Deserialize};
use serde_json::Value;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ListRequest {
    pub project: Option<String>,
    #[serde(default)]
    pub archived: bool,
    pub limit: Option<u32>,
    #[serde(default)]
    pub offset: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReadRequest {
    pub card_id: String,
    pub artifact_kind: Option<String>,
    pub artifact_version: Option<i64>,
    pub max_chars: Option<usize>,
    #[serde(default)]
    pub char_offset: usize,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateRequest {
    pub project: String,
    pub title: String,
    pub description: String,
    #[serde(default)]
    pub acceptance_criteria: String,
    pub base_ref: Option<String>,
    pub request_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ArchiveRequest {
    pub card_id: String,
    pub request_id: Option<String>,
}

pub fn parse<T: DeserializeOwned>(action: &str, input: &Value) -> Result<T, String> {
    if !input.is_object() {
        return Err(format!("{action} expects a JSON object."));
    }
    serde_json::from_value(input.clone()).map_err(|error| format!("Invalid {action}: {error}"))
}
