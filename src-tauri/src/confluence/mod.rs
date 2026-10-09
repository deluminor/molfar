//! Confluence Cloud read-only API — reuses Jira Atlassian credentials.

mod config;
mod constants;
mod http;
mod page;
mod parse;
mod search;
mod tree;
mod types;

#[cfg(test)]
mod tests;

use tauri::AppHandle;

use config::{read_config, require_config, require_disk_config, status_for};
use constants::{DEFAULT_LIMIT, SEARCH_LIMIT};
use http::{confluence_get, confluence_get_checked};
use page::{fetch_non_page, parse_page};
use parse::{encode, next_cursor, parse_spaces, valid_id};
use search::{build_search_cql, parse_search_results};
use tree::{list_node_children, list_space_roots};
use types::{AtlassianConfig, ConfluenceNode, ConfluencePage, ConfluenceSpace, ConfluenceStatus};

#[tauri::command(async)]
pub fn confluence_status(app: AppHandle) -> Result<ConfluenceStatus, String> {
    let config = read_config(&app)?;
    Ok(status_for(config.as_ref()))
}

#[tauri::command]
pub async fn confluence_list_spaces(app: AppHandle) -> Result<Vec<ConfluenceSpace>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let config = require_config(&app)?;
        let mut spaces = Vec::new();
        let mut cursor: Option<String> = None;
        loop {
            let mut path =
                format!("/wiki/api/v2/spaces?limit={DEFAULT_LIMIT}&status=current&type=global");
            if let Some(token) = cursor.as_ref() {
                path.push_str("&cursor=");
                path.push_str(&encode(token));
            }
            let data = confluence_get(&config, &path)?;
            spaces.extend(parse_spaces(&data));
            cursor = next_cursor(&data);
            if cursor.is_none() || spaces.len() >= 500 {
                break;
            }
        }
        spaces.sort_by_key(|space| space.name.to_lowercase());
        Ok(spaces)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn confluence_list_children(
    app: AppHandle,
    space_id: Option<String>,
    parent_id: Option<String>,
    space_key: Option<String>,
    parent_kind: Option<String>,
) -> Result<Vec<ConfluenceNode>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let config = require_config(&app)?;
        let parent = parent_id.unwrap_or_default().trim().to_string();
        let space = space_id.unwrap_or_default().trim().to_string();
        let key = space_key.unwrap_or_default().trim().to_string();
        let kind = parent_kind.unwrap_or_default();
        if !parent.is_empty() {
            if !valid_id(&parent) {
                return Err("Invalid Confluence page id".into());
            }
            return list_node_children(&config, &parent, &kind, &space, &key);
        }
        if space.is_empty() || !valid_id(&space) {
            return Err("Choose a Confluence space".into());
        }
        list_space_roots(&config, &space, &key)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn confluence_search(
    app: AppHandle,
    query: String,
    space_key: Option<String>,
    limit: Option<u32>,
) -> Result<Vec<ConfluenceNode>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let config = require_config(&app)?;
        let query = query.trim();
        if query.is_empty() {
            return Ok(Vec::new());
        }
        if query.len() > 200 {
            return Err("Search query is too long".into());
        }
        let limit = limit.unwrap_or(SEARCH_LIMIT).clamp(1, 50);
        let space = space_key.unwrap_or_default().trim().to_string();
        let cql = build_search_cql(query, &space);
        let path = format!(
            "/wiki/rest/api/content/search?cql={}&limit={limit}&expand=space,ancestors",
            encode(&cql)
        );
        let data = confluence_get(&config, &path)?;
        Ok(parse_search_results(&data, &config.site))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn confluence_page(app: AppHandle, id: String) -> Result<ConfluencePage, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let config = require_config(&app)?;
        load_page(&config, &id)
    })
    .await
    .map_err(|error| error.to_string())?
}

fn list_spaces_with(config: &AtlassianConfig) -> Result<Vec<ConfluenceSpace>, String> {
    let mut spaces = Vec::new();
    let mut cursor: Option<String> = None;
    loop {
        let mut path =
            format!("/wiki/api/v2/spaces?limit={DEFAULT_LIMIT}&status=current&type=global");
        if let Some(token) = cursor.as_ref() {
            path.push_str("&cursor=");
            path.push_str(&encode(token));
        }
        let data = confluence_get(config, &path)?;
        spaces.extend(parse_spaces(&data));
        cursor = next_cursor(&data);
        if cursor.is_none() || spaces.len() >= 500 {
            break;
        }
    }
    spaces.sort_by_key(|space| space.name.to_lowercase());
    Ok(spaces)
}

fn load_page(config: &AtlassianConfig, id: &str) -> Result<ConfluencePage, String> {
    let id = id.trim();
    if !valid_id(id) {
        return Err("Invalid Confluence page id".into());
    }
    match confluence_get_checked(
        config,
        &format!("/wiki/api/v2/pages/{id}?body-format=atlas_doc_format"),
    ) {
        Ok(page) => parse_page(&page, &config.site),
        Err(error) if error.is_not_found() => fetch_non_page(config, id),
        Err(error) => Err(error.message),
    }
}

pub(crate) fn mcp_search(
    query: &str,
    space_key: Option<&str>,
    limit: Option<u32>,
) -> Result<Vec<ConfluenceNode>, String> {
    let config = require_disk_config()?;
    let query = query.trim();
    if query.is_empty() {
        return Ok(Vec::new());
    }
    if query.len() > 200 {
        return Err("Search query is too long".into());
    }
    let limit = limit.unwrap_or(SEARCH_LIMIT).clamp(1, 50);
    let space = space_key.unwrap_or("").trim();
    let cql = build_search_cql(query, space);
    let path = format!(
        "/wiki/rest/api/content/search?cql={}&limit={limit}&expand=space,ancestors",
        encode(&cql)
    );
    let data = confluence_get(&config, &path)?;
    Ok(parse_search_results(&data, &config.site))
}

pub(crate) fn mcp_list(
    space_key: Option<&str>,
    space_id: Option<&str>,
    parent_id: Option<&str>,
    parent_kind: Option<&str>,
) -> Result<serde_json::Value, String> {
    let config = require_disk_config()?;
    let parent = parent_id.unwrap_or("").trim();
    let space = space_id.unwrap_or("").trim();
    let key = space_key.unwrap_or("").trim();
    let kind = parent_kind.unwrap_or("");

    if !parent.is_empty() {
        if !valid_id(parent) {
            return Err("Invalid Confluence page id".into());
        }
        let children = list_node_children(&config, parent, kind, space, key)?;
        return Ok(serde_json::json!({
            "parentId": parent,
            "spaceId": if space.is_empty() { serde_json::Value::Null } else { space.into() },
            "parentKind": if kind.is_empty() { serde_json::Value::Null } else { kind.into() },
            "children": children,
        }));
    }

    if space.is_empty() {
        if key.is_empty() {
            return Err("Provide spaceKey, spaceId, or parentId".into());
        }
        let spaces = list_spaces_with(&config)?;
        let found = spaces
            .iter()
            .find(|entry| entry.key.eq_ignore_ascii_case(key))
            .ok_or_else(|| format!("Confluence space \"{key}\" not found"))?;
        let children = list_space_roots(&config, &found.id, &found.key)?;
        return Ok(serde_json::json!({
            "space": { "id": found.id, "key": found.key, "name": found.name },
            "children": children,
        }));
    }

    if !valid_id(space) {
        return Err("Choose a Confluence space".into());
    }
    let children = list_space_roots(&config, space, key)?;
    Ok(serde_json::json!({
        "parentId": serde_json::Value::Null,
        "spaceId": space,
        "parentKind": serde_json::Value::Null,
        "children": children,
    }))
}

pub(crate) fn mcp_read(id: &str) -> Result<serde_json::Value, String> {
    let config = require_disk_config()?;
    let page = load_page(&config, id)?;
    if page.kind == "folder" || !page.readable {
        let children = list_node_children(
            &config,
            &page.id,
            &page.kind,
            &page.space_id,
            &page.space_key,
        )?;
        return Ok(serde_json::json!({
            "id": page.id,
            "title": page.title,
            "kind": page.kind,
            "url": page.url,
            "readable": false,
            "children": children,
        }));
    }
    Ok(serde_json::json!({
        "id": page.id,
        "title": page.title,
        "kind": page.kind,
        "url": page.url,
        "readable": page.readable,
        "body": page.body,
        "spaceId": page.space_id,
        "spaceKey": page.space_key,
    }))
}
