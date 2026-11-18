use super::normalize_request_id;
use crate::task_board::{
    constants::{MAX_CRITERIA, MAX_DESCRIPTION, MAX_TITLE},
    create::validation,
};
use serde::Deserialize;
use serde_json::Value;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateRequest {
    pub card_id: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub acceptance_criteria: Option<String>,
    #[serde(default)]
    pub request_id: String,
}

/// Validates content only; adapters must authorize the card and enforce mutation
/// eligibility and durable receipts before applying the patch.
pub fn parse_update(input: Value, envelope: Option<&str>) -> Result<UpdateRequest, String> {
    let object = input
        .as_object()
        .ok_or("Expected Board update arguments.")?;
    if object.values().any(Value::is_null) {
        return Err("Board update fields cannot be null.".into());
    }
    let has_request_id = object.contains_key("requestId");
    let mut request: UpdateRequest =
        serde_json::from_value(input).map_err(|error| format!("Invalid Board update: {error}"))?;
    validation::id(&request.card_id)?;
    let argument = if has_request_id {
        Some(request.request_id.as_str())
    } else {
        None
    };
    request.request_id = normalize_request_id(argument, envelope)?;
    if request.title.is_none()
        && request.description.is_none()
        && request.acceptance_criteria.is_none()
    {
        return Err("Board update requires a content patch.".into());
    }

    for (field, max, required, label) in [
        (&mut request.title, MAX_TITLE, true, "Title"),
        (
            &mut request.description,
            MAX_DESCRIPTION,
            true,
            "Description",
        ),
        (
            &mut request.acceptance_criteria,
            MAX_CRITERIA,
            false,
            "Acceptance criteria",
        ),
    ] {
        if let Some(value) = field {
            *value = validation::content(value, max, required, label)?;
        }
    }
    Ok(request)
}
