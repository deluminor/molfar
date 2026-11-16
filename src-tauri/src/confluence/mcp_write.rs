use super::*;

pub(crate) fn mcp_page_create(
    space_id: Option<&str>,
    space_key: Option<&str>,
    title: &str,
    body: &str,
    parent_id: Option<&str>,
) -> Result<Value, String> {
    let config = require_disk_config()?;
    let title = title.trim();
    let body = body.trim();
    if title.is_empty() {
        return Err("title is required".into());
    }
    if body.is_empty() {
        return Err("body is required".into());
    }

    let space_id = resolve_space_id(&config, space_id, space_key)?;
    let mut payload = json!({
        "spaceId": space_id,
        "status": "current",
        "title": title,
        "body": {
            "representation": "storage",
            "value": text_to_storage(body),
        }
    });
    if let Some(parent) = parent_id.map(str::trim).filter(|id| !id.is_empty()) {
        if !valid_id(parent) {
            return Err("Invalid Confluence parent id".into());
        }
        payload
            .as_object_mut()
            .expect("payload object")
            .insert("parentId".into(), json!(parent));
    }

    let created = confluence_post(&config, "/wiki/api/v2/pages", &payload)?;
    let id = created
        .get("id")
        .and_then(Value::as_str)
        .ok_or_else(|| "Could not create Confluence page".to_string())?;
    mcp_read(id)
}

pub(crate) fn mcp_page_update(
    id: &str,
    title: Option<&str>,
    body: Option<&str>,
    version_message: Option<&str>,
) -> Result<Value, String> {
    let config = require_disk_config()?;
    let id = id.trim();
    if !valid_id(id) {
        return Err("Invalid Confluence page id".into());
    }
    let title = title.map(str::trim).filter(|value| !value.is_empty());
    let body = body.map(str::trim).filter(|value| !value.is_empty());
    if title.is_none() && body.is_none() {
        return Err("Provide title and/or body to update".into());
    }

    let current = confluence_get(
        &config,
        &format!("/wiki/api/v2/pages/{id}?body-format=storage"),
    )?;
    let current_title = current
        .get("title")
        .and_then(Value::as_str)
        .unwrap_or("Untitled");
    let version = current
        .pointer("/version/number")
        .and_then(Value::as_u64)
        .ok_or_else(|| "Confluence page is missing a version".to_string())?;
    let current_body = current
        .pointer("/body/storage/value")
        .and_then(Value::as_str)
        .unwrap_or("");

    let next_title = title.unwrap_or(current_title);
    let next_body = body
        .map(text_to_storage)
        .unwrap_or_else(|| current_body.to_string());
    let message = version_message
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("Updated via molfar-connectors");

    let payload = json!({
        "id": id,
        "status": "current",
        "title": next_title,
        "body": {
            "representation": "storage",
            "value": next_body,
        },
        "version": {
            "number": version + 1,
            "message": message,
        }
    });
    confluence_put(&config, &format!("/wiki/api/v2/pages/{id}"), &payload)?;
    mcp_read(id)
}

pub(super) fn resolve_space_id(
    config: &AtlassianConfig,
    space_id: Option<&str>,
    space_key: Option<&str>,
) -> Result<String, String> {
    let space_id = space_id.unwrap_or("").trim();
    if !space_id.is_empty() {
        if !valid_id(space_id) {
            return Err("Invalid Confluence space id".into());
        }
        return Ok(space_id.to_string());
    }
    let key = space_key.unwrap_or("").trim();
    if key.is_empty() {
        return Err("Provide spaceId or spaceKey".into());
    }
    let spaces = list_spaces_with(config)?;
    spaces
        .iter()
        .find(|entry| entry.key.eq_ignore_ascii_case(key))
        .map(|entry| entry.id.clone())
        .ok_or_else(|| format!("Confluence space \"{key}\" not found"))
}

/// Plain text → Confluence storage HTML: blank lines split paragraphs, newlines become `<br />`.
pub(super) fn text_to_storage(text: &str) -> String {
    text.replace("\r\n", "\n")
        .split("\n\n")
        .map(str::trim)
        .filter(|paragraph| !paragraph.is_empty())
        .map(|paragraph| {
            let escaped = escape_storage(paragraph).replace('\n', "<br />");
            format!("<p>{escaped}</p>")
        })
        .collect()
}

pub(super) fn escape_storage(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}
