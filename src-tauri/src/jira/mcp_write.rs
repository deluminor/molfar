use serde_json::{json, Value};

use super::mcp::mcp_issue_get;
use super::write::{pack_write_fields, text_to_adf};
use super::*;

pub(crate) fn mcp_issue_comment(key: &str, body: &str) -> Result<String, String> {
    let config = require_disk_config()?;
    let key = require_issue_key(key)?;
    let body = body.trim();
    if body.is_empty() {
        return Err("Comment cannot be empty".into());
    }
    let data = jira_post(
        &config,
        &format!("/rest/api/3/issue/{key}/comment"),
        &json!({ "body": text_to_adf(body) }),
    )?;
    let id = string_field(&data, "id").unwrap_or_default();
    if id.is_empty() {
        return Err("Could not post Jira comment".into());
    }
    Ok(comment_url(&config.site, key, &id))
}

pub(crate) fn mcp_issue_edit(key: &str, fields: &Value) -> Result<Value, String> {
    let config = require_disk_config()?;
    let key = require_issue_key(key)?;
    let packed = pack_write_fields(fields)?;
    if packed
        .as_object()
        .map(|object| object.is_empty())
        .unwrap_or(true)
    {
        return Err("fields must include at least one field to update".into());
    }
    jira_put(
        &config,
        &format!("/rest/api/3/issue/{key}"),
        &json!({ "fields": packed }),
    )?;
    mcp_issue_get(key, None)
}

pub(crate) fn mcp_issue_create(
    project_key: &str,
    issue_type_name: &str,
    summary: &str,
    description: Option<&str>,
    parent: Option<&str>,
    additional_fields: Option<&Value>,
) -> Result<Value, String> {
    let config = require_disk_config()?;
    let project_key = project_key.trim();
    let issue_type_name = issue_type_name.trim();
    let summary = summary.trim();
    if project_key.is_empty() {
        return Err("projectKey is required".into());
    }
    if issue_type_name.is_empty() {
        return Err("issueTypeName is required".into());
    }
    if summary.is_empty() {
        return Err("summary is required".into());
    }

    let mut fields = serde_json::Map::new();
    fields.insert("project".into(), json!({ "key": project_key }));
    fields.insert("issuetype".into(), json!({ "name": issue_type_name }));
    fields.insert("summary".into(), json!(summary));
    if let Some(text) = description.map(str::trim).filter(|text| !text.is_empty()) {
        fields.insert("description".into(), text_to_adf(text));
    }
    if let Some(parent_key) = parent.map(str::trim).filter(|key| !key.is_empty()) {
        require_issue_key(parent_key)?;
        fields.insert("parent".into(), json!({ "key": parent_key }));
    }
    if let Some(extra) = additional_fields {
        let packed = pack_write_fields(extra)?;
        if let Some(object) = packed.as_object() {
            for (key, value) in object {
                fields.insert(key.clone(), value.clone());
            }
        }
    }

    let data = jira_post(&config, "/rest/api/3/issue", &json!({ "fields": fields }))?;
    let key = string_field(&data, "key").unwrap_or_default();
    if key.is_empty() {
        return Err("Could not create Jira issue".into());
    }
    mcp_issue_get(&key, None)
}

pub(crate) fn mcp_issue_transitions(key: &str) -> Result<Value, String> {
    let config = require_disk_config()?;
    let key = require_issue_key(key)?;
    let data = jira_get(&config, &format!("/rest/api/3/issue/{key}/transitions"))?;
    let transitions = data
        .get("transitions")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|transition| {
            let id = string_field(&transition, "id")?;
            let name = string_field(&transition, "name").unwrap_or_default();
            let to = transition
                .pointer("/to/name")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            Some(json!({ "id": id, "name": name, "to": to }))
        })
        .collect::<Vec<_>>();
    Ok(json!({ "key": key, "transitions": transitions }))
}

pub(crate) fn mcp_issue_transition(
    key: &str,
    transition_id: &str,
    fields: Option<&Value>,
) -> Result<Value, String> {
    let config = require_disk_config()?;
    let key = require_issue_key(key)?;
    let transition_id = transition_id.trim();
    if transition_id.is_empty() {
        return Err("transitionId is required".into());
    }
    let mut body = json!({ "transition": { "id": transition_id } });
    if let Some(fields) = fields {
        let packed = pack_write_fields(fields)?;
        if let Some(object) = packed.as_object() {
            if !object.is_empty() {
                body.as_object_mut()
                    .expect("body object")
                    .insert("fields".into(), packed);
            }
        }
    }
    jira_post(
        &config,
        &format!("/rest/api/3/issue/{key}/transitions"),
        &body,
    )?;
    mcp_issue_get(key, None)
}
