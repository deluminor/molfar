use serde_json::{json, Value};

use super::string_field;
use crate::atlassian_adf::rich_text;

pub(super) const DEFAULT_ISSUE_GET_FIELDS: [&str; 12] = [
    "summary",
    "description",
    "status",
    "issuetype",
    "priority",
    "labels",
    "assignee",
    "reporter",
    "created",
    "updated",
    "resolution",
    "project",
];

/// Posts plain text as ADF: blank lines split paragraphs, single newlines become hard breaks.
pub(super) fn text_to_adf(text: &str) -> Value {
    let paragraphs: Vec<Value> = text
        .replace("\r\n", "\n")
        .split("\n\n")
        .map(str::trim)
        .filter(|paragraph| !paragraph.is_empty())
        .map(|paragraph| {
            let mut content = Vec::new();
            for (index, line) in paragraph.lines().enumerate() {
                if index > 0 {
                    content.push(json!({ "type": "hardBreak" }));
                }
                if !line.is_empty() {
                    content.push(json!({ "type": "text", "text": line }));
                }
            }
            json!({ "type": "paragraph", "content": content })
        })
        .collect();
    json!({ "type": "doc", "version": 1, "content": paragraphs })
}

/// Convert MCP field values for write: string `description` becomes ADF; ADF docs pass through.
pub(super) fn pack_write_fields(fields: &Value) -> Result<Value, String> {
    let object = fields
        .as_object()
        .ok_or_else(|| "fields must be a JSON object".to_string())?;
    let mut packed = serde_json::Map::new();
    for (key, value) in object {
        if key == "description" {
            packed.insert(key.clone(), pack_description_value(value)?);
        } else {
            packed.insert(key.clone(), value.clone());
        }
    }
    Ok(Value::Object(packed))
}

pub(super) fn pack_description_value(value: &Value) -> Result<Value, String> {
    if value.is_null() {
        return Ok(Value::Null);
    }
    if let Some(text) = value.as_str() {
        return Ok(text_to_adf(text));
    }
    if value.get("type").and_then(Value::as_str) == Some("doc") {
        return Ok(value.clone());
    }
    Err("description must be a string, ADF doc, or null".into())
}

pub(super) fn fields_query(fields: Option<&[String]>) -> String {
    match fields {
        None | Some([]) => DEFAULT_ISSUE_GET_FIELDS.join(","),
        Some(list) if list.iter().any(|field| field.trim() == "*all") => "*all".into(),
        Some(list) => list
            .iter()
            .map(|field| field.trim())
            .filter(|field| !field.is_empty())
            .collect::<Vec<_>>()
            .join(","),
    }
}

pub(super) fn issue_browse_url(site: &str, key: &str) -> String {
    format!("{site}/browse/{key}")
}

pub(super) fn summarize_issue_payload(site: &str, data: &Value) -> Result<Value, String> {
    let key = string_field(data, "key").unwrap_or_default();
    if key.is_empty() {
        return Err("Jira did not return that issue".into());
    }
    let fields = data.get("fields").cloned().unwrap_or_else(|| json!({}));
    let description = rich_text(fields.get("description"));
    let mut fields_out = fields.clone();
    if let Some(object) = fields_out.as_object_mut() {
        object.insert("description".into(), Value::String(description.clone()));
    }
    Ok(json!({
        "key": key,
        "id": string_field(data, "id").unwrap_or_default(),
        "url": issue_browse_url(site, &key),
        "summary": fields.get("summary").and_then(Value::as_str).unwrap_or(""),
        "description": description,
        "status": fields.pointer("/status/name").and_then(Value::as_str).unwrap_or(""),
        "issueType": fields.pointer("/issuetype/name").and_then(Value::as_str).unwrap_or(""),
        "fields": fields_out,
    }))
}
