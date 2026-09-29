//! Confluence Cloud read-only API — reuses Jira Atlassian credentials.

use std::fs;
use std::path::PathBuf;
use std::time::Duration;

use base64::Engine as _;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager};
use url::form_urlencoded;

use crate::atlassian_adf::rich_text;

const HTTP_TIMEOUT: Duration = Duration::from_secs(20);
const DEFAULT_LIMIT: u32 = 50;
const SEARCH_LIMIT: u32 = 25;
const BODY_CHAR_CAP: usize = 120_000;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfluenceStatus {
    pub connected: bool,
    pub site: String,
    pub email: String,
}

#[derive(Deserialize, Clone)]
struct AtlassianConfig {
    site: String,
    email: String,
    token: String,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ConfluenceSpace {
    pub id: String,
    pub key: String,
    pub name: String,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ConfluenceNode {
    pub id: String,
    pub title: String,
    pub kind: String,
    pub space_id: String,
    pub space_key: String,
    pub parent_id: String,
    pub url: String,
    pub has_children: bool,
    pub readable: bool,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ConfluencePage {
    pub id: String,
    pub title: String,
    pub kind: String,
    pub space_id: String,
    pub space_key: String,
    pub parent_id: String,
    pub url: String,
    pub body: String,
    pub readable: bool,
    pub truncated: bool,
}

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
            let mut path = format!(
                "/wiki/api/v2/spaces?limit={DEFAULT_LIMIT}&status=current&type=global"
            );
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
        spaces.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
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
        let id = id.trim();
        if !valid_id(id) {
            return Err("Invalid Confluence page id".into());
        }

        // Folders / whiteboards / other types live under different v2 resources.
        match confluence_get_checked(
            &config,
            &format!("/wiki/api/v2/pages/{id}?body-format=atlas_doc_format"),
        ) {
            Ok(page) => parse_page(&page, &config.site),
            Err(error) if error.is_not_found() => fetch_non_page(&config, id),
            Err(error) => Err(error.message),
        }
    })
    .await
    .map_err(|error| error.to_string())?
}

fn list_space_roots(
    config: &AtlassianConfig,
    space_id: &str,
    space_key: &str,
) -> Result<Vec<ConfluenceNode>, String> {
    // Prefer the space homepage's content tree — matches Confluence sidebar.
    if let Ok(Some(homepage_id)) = space_homepage_id(config, space_id) {
        if let Ok(children) =
            list_content_direct_children(config, "pages", &homepage_id, space_id, space_key)
        {
            if !children.is_empty() {
                return Ok(children);
            }
        }
    }
    list_space_root_fallback(config, space_id, space_key)
}

fn space_homepage_id(
    config: &AtlassianConfig,
    space_id: &str,
) -> Result<Option<String>, String> {
    let data = confluence_get(config, &format!("/wiki/api/v2/spaces/{space_id}"))?;
    Ok(string_field(&data, "homepageId").filter(|id| valid_id(id)))
}

fn list_space_root_fallback(
    config: &AtlassianConfig,
    space_id: &str,
    space_key: &str,
) -> Result<Vec<ConfluenceNode>, String> {
    let mut nodes = Vec::new();
    let mut cursor: Option<String> = None;
    loop {
        let mut path = format!(
            "/wiki/api/v2/spaces/{space_id}/pages?limit={DEFAULT_LIMIT}&depth=root"
        );
        if let Some(token) = cursor.as_ref() {
            path.push_str("&cursor=");
            path.push_str(&encode(token));
        }
        let data = confluence_get(config, &path)?;
        nodes.extend(parse_v2_pages(
            &data,
            space_id,
            space_key,
            "",
            &config.site,
        ));
        cursor = next_cursor(&data);
        if cursor.is_none() || nodes.len() >= 400 {
            break;
        }
    }
    if let Ok(folders) = list_space_folders(config, space_id, space_key) {
        for folder in folders {
            if !nodes.iter().any(|node| node.id == folder.id) {
                nodes.push(folder);
            }
        }
    }
    nodes.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
    Ok(nodes)
}

fn list_space_folders(
    config: &AtlassianConfig,
    space_id: &str,
    space_key: &str,
) -> Result<Vec<ConfluenceNode>, String> {
    let mut nodes = Vec::new();
    let mut cursor: Option<String> = None;
    loop {
        let mut path = format!(
            "/wiki/api/v2/folders?limit={DEFAULT_LIMIT}&space-id={space_id}"
        );
        if let Some(token) = cursor.as_ref() {
            path.push_str("&cursor=");
            path.push_str(&encode(token));
        }
        let data = match confluence_get(config, &path) {
            Ok(data) => data,
            Err(_) => break,
        };
        for item in results_array(&data) {
            if let Some(node) = parse_v2_node(item, space_id, space_key, "", &config.site) {
                if node.parent_id.is_empty() {
                    nodes.push(node);
                }
            }
        }
        cursor = next_cursor(&data);
        if cursor.is_none() {
            break;
        }
    }
    Ok(nodes)
}

fn list_node_children(
    config: &AtlassianConfig,
    parent_id: &str,
    parent_kind: &str,
    space_id: &str,
    space_key: &str,
) -> Result<Vec<ConfluenceNode>, String> {
    let kind = normalize_kind(parent_kind);
    let primary = match kind.as_str() {
        "folder" => "folders",
        _ => "pages",
    };
    let secondary = if primary == "pages" {
        "folders"
    } else {
        "pages"
    };
    match list_content_direct_children(config, primary, parent_id, space_id, space_key) {
        Ok(nodes) => Ok(nodes),
        Err(error) => match list_content_direct_children(
            config,
            secondary,
            parent_id,
            space_id,
            space_key,
        ) {
            Ok(nodes) => Ok(nodes),
            Err(_) => Err(error),
        },
    }
}

fn list_content_direct_children(
    config: &AtlassianConfig,
    kind_path: &str,
    parent_id: &str,
    space_id: &str,
    space_key: &str,
) -> Result<Vec<ConfluenceNode>, String> {
    let mut nodes = Vec::new();
    let mut cursor: Option<String> = None;
    loop {
        let mut path = format!(
            "/wiki/api/v2/{kind_path}/{parent_id}/direct-children?limit={DEFAULT_LIMIT}"
        );
        if let Some(token) = cursor.as_ref() {
            path.push_str("&cursor=");
            path.push_str(&encode(token));
        }
        let data = confluence_get(config, &path)?;
        nodes.extend(parse_v2_pages(
            &data,
            space_id,
            space_key,
            parent_id,
            &config.site,
        ));
        cursor = next_cursor(&data);
        if cursor.is_none() || nodes.len() >= 400 {
            break;
        }
    }
    nodes.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
    Ok(nodes)
}

fn fetch_non_page(config: &AtlassianConfig, id: &str) -> Result<ConfluencePage, String> {
    if let Ok(data) = confluence_get(config, &format!("/wiki/api/v2/folders/{id}")) {
        return Ok(unsupported_page(&data, "folder", &config.site));
    }

    if let Ok(data) = confluence_get(config, &format!("/wiki/api/v2/whiteboards/{id}")) {
        return Ok(unsupported_page(&data, "whiteboard", &config.site));
    }

    let data = confluence_get(
        config,
        &format!("/wiki/rest/api/content/{id}?expand=space,ancestors"),
    )?;
    let kind = normalize_kind(string_field(&data, "type").as_deref().unwrap_or("other"));
    Ok(unsupported_from_v1(&data, &kind, &config.site))
}

fn unsupported_page(data: &Value, kind: &str, site: &str) -> ConfluencePage {
    let id = string_field(data, "id").unwrap_or_default();
    let title = string_field(data, "title").unwrap_or_else(|| "Untitled".into());
    let space_id = data
        .pointer("/spaceId")
        .and_then(Value::as_str)
        .or_else(|| data.pointer("/space/id").and_then(Value::as_str))
        .unwrap_or_default()
        .to_string();
    ConfluencePage {
        id: id.clone(),
        title: title.clone(),
        kind: kind.into(),
        space_id,
        space_key: String::new(),
        parent_id: String::new(),
        url: content_url(site, kind, &id),
        body: format!(
            "_This Confluence {kind} cannot be read as markdown in MonoCode. Open it in Confluence instead._\n\n[{title}]({})",
            content_url(site, kind, &id)
        ),
        readable: false,
        truncated: false,
    }
}

fn unsupported_from_v1(data: &Value, kind: &str, site: &str) -> ConfluencePage {
    let id = string_field(data, "id").unwrap_or_default();
    let title = string_field(data, "title").unwrap_or_else(|| "Untitled".into());
    let space_key = data
        .pointer("/space/key")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let space_id = data
        .pointer("/space/id")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let webui = data
        .pointer("/_links/webui")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let url = if webui.is_empty() {
        content_url(site, kind, &id)
    } else {
        format!("{site}/wiki{webui}")
    };
    ConfluencePage {
        id,
        title: title.clone(),
        kind: kind.into(),
        space_id,
        space_key,
        parent_id: String::new(),
        url: url.clone(),
        body: format!(
            "_This Confluence {kind} cannot be read as markdown in MonoCode. Open it in Confluence instead._\n\n[{title}]({url})"
        ),
        readable: false,
        truncated: false,
    }
}

fn parse_page(data: &Value, site: &str) -> Result<ConfluencePage, String> {
    let id = string_field(data, "id").ok_or_else(|| "Confluence page is missing an id".to_string())?;
    let title = string_field(data, "title").unwrap_or_else(|| "Untitled".into());
    let kind = normalize_kind(
        data.get("type")
            .and_then(Value::as_str)
            .or_else(|| data.get("status").and_then(Value::as_str))
            .unwrap_or("page"),
    );
    // v2 pages are always pages when returned from /pages/{id}
    let kind = if kind == "other" { "page".into() } else { kind };

    let space_id = data
        .get("spaceId")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let parent_id = data
        .get("parentId")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let webui = data
        .pointer("/_links/webui")
        .and_then(Value::as_str)
        .unwrap_or_default();

    let url = if webui.is_empty() {
        content_url(site, "page", &id)
    } else if webui.starts_with("http") {
        webui.to_string()
    } else {
        format!("{site}/wiki{webui}")
    };

    let adf_value = data.pointer("/body/atlas_doc_format/value");
    let (mut body, truncated) = match adf_value {
        Some(Value::String(raw)) => {
            let parsed: Value = serde_json::from_str(raw).unwrap_or(Value::Null);
            let markdown = rich_text(Some(&parsed));
            truncate_body(markdown)
        }
        Some(doc @ Value::Object(_)) => truncate_body(rich_text(Some(doc))),
        _ => (String::new(), false),
    };

    if body.trim().is_empty() {
        body = format!("_Empty page._\n\n[{title}]({url})");
    }

    Ok(ConfluencePage {
        id,
        title,
        kind,
        space_id,
        space_key: String::new(),
        parent_id,
        url,
        body,
        readable: true,
        truncated,
    })
}

fn truncate_body(body: String) -> (String, bool) {
    if body.len() <= BODY_CHAR_CAP {
        return (body, false);
    }
    let mut end = BODY_CHAR_CAP;
    while end > 0 && !body.is_char_boundary(end) {
        end -= 1;
    }
    (
        format!(
            "{}\n\n_…truncated. Use confluence.read on a smaller page or open in Confluence._",
            &body[..end]
        ),
        true,
    )
}

fn parse_spaces(data: &Value) -> Vec<ConfluenceSpace> {
    results_array(data)
        .iter()
        .filter_map(|item| {
            let id = string_field(item, "id")?;
            let key = string_field(item, "key")?;
            let name = string_field(item, "name").unwrap_or_else(|| key.clone());
            Some(ConfluenceSpace { id, key, name })
        })
        .collect()
}

fn parse_v2_pages(
    data: &Value,
    space_id: &str,
    space_key: &str,
    parent_id: &str,
    site: &str,
) -> Vec<ConfluenceNode> {
    results_array(data)
        .iter()
        .filter_map(|item| parse_v2_node(item, space_id, space_key, parent_id, site))
        .collect()
}

fn parse_v2_node(
    item: &Value,
    space_id: &str,
    space_key: &str,
    parent_id: &str,
    site: &str,
) -> Option<ConfluenceNode> {
    let (kind, source) = if let Some(page) = item.get("page") {
        ("page".to_string(), page)
    } else if let Some(folder) = item.get("folder") {
        ("folder".to_string(), folder)
    } else if let Some(board) = item.get("whiteboard") {
        ("whiteboard".to_string(), board)
    } else {
        let type_hint = item
            .get("type")
            .and_then(Value::as_str)
            .or_else(|| item.get("status").and_then(Value::as_str))
            .unwrap_or("page");
        (normalize_kind(type_hint), item)
    };

    let id = string_field(source, "id")?;
    let title = string_field(source, "title").unwrap_or_else(|| "Untitled".into());
    let resolved_space = source
        .get("spaceId")
        .and_then(Value::as_str)
        .unwrap_or(space_id)
        .to_string();
    let resolved_parent = source
        .get("parentId")
        .and_then(Value::as_str)
        .unwrap_or(parent_id)
        .to_string();
    let webui = source
        .pointer("/_links/webui")
        .and_then(Value::as_str)
        .unwrap_or_default();

    let url = if webui.is_empty() {
        content_url(site, &kind, &id)
    } else if webui.starts_with("http") {
        webui.to_string()
    } else {
        format!("{site}/wiki{webui}")
    };

    // `childPosition` is sibling order, not a child count — never use it here.
    let has_children = source
        .get("hasChildren")
        .and_then(Value::as_bool)
        .unwrap_or_else(|| {
            matches!(
                kind.as_str(),
                "folder" | "page" | "blogpost" | "whiteboard" | "database"
            )
        });
    let readable = kind == "page" || kind == "blogpost";

    Some(ConfluenceNode {
        id,
        title,
        kind,
        space_id: resolved_space,
        space_key: space_key.to_string(),
        parent_id: resolved_parent,
        url,
        has_children,
        readable,
    })
}

fn parse_search_results(data: &Value, site: &str) -> Vec<ConfluenceNode> {
    let results = data
        .get("results")
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or_default();
    results
        .iter()
        .filter_map(|item| {
            let content = item.get("content").unwrap_or(item);
            let id = string_field(content, "id")?;
            let title = string_field(content, "title").unwrap_or_else(|| "Untitled".into());
            let kind = normalize_kind(string_field(content, "type").as_deref().unwrap_or("page"));
            let space_key = content
                .pointer("/space/key")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
            let space_id = content
                .pointer("/space/id")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
            let ancestors = content
                .get("ancestors")
                .and_then(Value::as_array)
                .map(Vec::as_slice)
                .unwrap_or_default();
            let parent_id = ancestors
                .last()
                .and_then(|node| string_field(node, "id"))
                .unwrap_or_default();
            let webui = content
                .pointer("/_links/webui")
                .or_else(|| item.pointer("/url"))
                .and_then(Value::as_str)
                .unwrap_or_default();
            let url = if webui.starts_with("http") {
                webui.to_string()
            } else if !webui.is_empty() {
                format!("{site}/wiki{webui}")
            } else {
                content_url(site, &kind, &id)
            };
            Some(ConfluenceNode {
                id,
                title,
                kind: kind.clone(),
                space_id,
                space_key,
                parent_id,
                url,
                has_children: kind == "folder",
                readable: kind == "page" || kind == "blogpost",
            })
        })
        .collect()
}

pub fn build_search_cql(query: &str, space_key: &str) -> String {
    let escaped = escape_cql(query);
    let mut clauses = vec![
        "type in (page,folder,blogpost)".to_string(),
        format!("text ~ \"{escaped}\""),
    ];

    if !space_key.is_empty() && space_key.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '_') {
        clauses.push(format!("space = \"{space_key}\""));
    }

    format!("{} ORDER BY lastmodified DESC", clauses.join(" AND "))
}

fn escape_cql(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

fn normalize_kind(raw: &str) -> String {
    match raw.trim().to_ascii_lowercase().as_str() {
        "page" => "page".into(),
        "folder" => "folder".into(),
        "whiteboard" => "whiteboard".into(),
        "database" => "database".into(),
        "embed" | "smart-link" | "smartlink" => "embed".into(),
        "blogpost" | "blog" => "blogpost".into(),
        "current" => "page".into(), // v2 status field misuse guard
        other if other.is_empty() => "other".into(),
        _ => "other".into(),
    }
}

fn content_url(site: &str, kind: &str, id: &str) -> String {
    let site = site.trim_end_matches('/');
    match kind {
        "folder" => format!("{site}/wiki/folder/{id}"),
        "whiteboard" => format!("{site}/wiki/whiteboard/{id}"),
        _ => format!("{site}/wiki/pages/viewpage.action?pageId={id}"),
    }
}

fn results_array(data: &Value) -> &[Value] {
    data.get("results")
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or_default()
}

fn next_cursor(data: &Value) -> Option<String> {
    data.pointer("/_links/next")
        .and_then(Value::as_str)
        .and_then(|link| {
            url::Url::parse(&format!("https://placeholder.local{link}"))
                .ok()
                .and_then(|url| {
                    url.query_pairs()
                        .find(|(key, _)| key == "cursor")
                        .map(|(_, value)| value.to_string())
                })
                .or_else(|| {
                    // Relative query-only next link
                    link.split("cursor=")
                        .nth(1)
                        .map(|rest| rest.split('&').next().unwrap_or(rest).to_string())
                })
        })
}

fn string_field(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(|field| {
            field
                .as_str()
                .map(str::to_string)
                .or_else(|| field.as_i64().map(|n| n.to_string()))
                .or_else(|| field.as_u64().map(|n| n.to_string()))
        })
        .map(|text| text.trim().to_string())
        .filter(|text| !text.is_empty())
}

fn valid_id(value: &str) -> bool {
    let trimmed = value.trim();
    !trimmed.is_empty()
        && trimmed.len() <= 64
        && trimmed
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_')
}

fn encode(value: &str) -> String {
    form_urlencoded::byte_serialize(value.as_bytes()).collect()
}

fn status_for(config: Option<&AtlassianConfig>) -> ConfluenceStatus {
    ConfluenceStatus {
        connected: config.is_some(),
        site: config.map(|c| c.site.clone()).unwrap_or_default(),
        email: config.map(|c| c.email.clone()).unwrap_or_default(),
    }
}

fn authorization(config: &AtlassianConfig) -> String {
    let encoded = base64::engine::general_purpose::STANDARD.encode(format!(
        "{}:{}",
        config.email.trim(),
        config.token.trim()
    ));
    format!("Basic {encoded}")
}

#[derive(Debug)]
struct HttpError {
    status: Option<u16>,
    message: String,
}

impl HttpError {
    fn is_not_found(&self) -> bool {
        matches!(self.status, Some(404))
            || self.message.to_ascii_lowercase().contains("not found")
    }
}

fn confluence_get(config: &AtlassianConfig, path: &str) -> Result<Value, String> {
    confluence_get_checked(config, path).map_err(|error| error.message)
}

fn confluence_get_checked(config: &AtlassianConfig, path: &str) -> Result<Value, HttpError> {
    let agent = ureq::AgentBuilder::new().timeout(HTTP_TIMEOUT).build();
    let url = format!("{}{path}", config.site.trim_end_matches('/'));

    let result = agent
        .get(&url)
        .set("Authorization", &authorization(config))
        .set("Accept", "application/json")
        .call();

    read_response(result)
}

fn read_response(result: Result<ureq::Response, ureq::Error>) -> Result<Value, HttpError> {
    let response = match result {
        Ok(response) => response,
        Err(ureq::Error::Status(401, _)) => {
            return Err(HttpError {
                status: Some(401),
                message: "Jira/Confluence email or API token is invalid".into(),
            });
        }
        Err(ureq::Error::Status(status, response)) => {
            let body = response.into_string().unwrap_or_default();
            return Err(HttpError {
                status: Some(status),
                message: http_error(status, &body),
            });
        }
        Err(_) => {
            return Err(HttpError {
                status: None,
                message: "Could not reach Confluence".into(),
            });
        }
    };

    let status = response.status();
    let body = response.into_string().map_err(|_| HttpError {
        status: Some(status),
        message: "Confluence returned an unreadable response".into(),
    })?;

    if !(200..300).contains(&status) {
        return Err(HttpError {
            status: Some(status),
            message: http_error(status, &body),
        });
    }

    serde_json::from_str(&body).map_err(|_| HttpError {
        status: Some(status),
        message: "Confluence returned invalid JSON".into(),
    })
}

fn http_error(status: u16, body: &str) -> String {
    if let Some(message) = error_message(body) {
        return message;
    }
    match status {
        403 => "Confluence denied access. Check that this API token can use Confluence".into(),
        404 => "Confluence could not find that page".into(),
        _ => format!("Confluence request failed ({status})"),
    }
}

fn error_message(body: &str) -> Option<String> {
    let parsed: Value = serde_json::from_str(body).ok()?;
    parsed
        .get("message")
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| {
            parsed
                .pointer("/errors/0/title")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("jira-config.json"))
}

fn normalize_site(raw: &str) -> Result<String, String> {
    let raw = raw.trim().trim_end_matches('/');
    if raw.is_empty() {
        return Err("Connect Jira in Settings".into());
    }
    let with_scheme = if raw.contains("://") {
        raw.to_string()
    } else if raw.contains('.') {
        format!("https://{raw}")
    } else {
        format!("https://{raw}.atlassian.net")
    };
    let url = url::Url::parse(&with_scheme).map_err(|_| "Jira site is invalid".to_string())?;
    if url.scheme() != "https" {
        return Err("Jira site must use HTTPS".into());
    }
    let host = url
        .host_str()
        .filter(|host| !host.is_empty())
        .ok_or_else(|| "Jira site is invalid".to_string())?;
    Ok(match url.port() {
        Some(port) => format!("https://{}:{port}", host.to_ascii_lowercase()),
        None => format!("https://{}", host.to_ascii_lowercase()),
    })
}

fn read_config(app: &AppHandle) -> Result<Option<AtlassianConfig>, String> {
    let path = config_path(app)?;
    match fs::read_to_string(path) {
        Ok(raw) => {
            let mut config: AtlassianConfig = serde_json::from_str(&raw)
                .map_err(|_| "Jira settings are invalid".to_string())?;
            config.site = normalize_site(&config.site)?;
            config.email = config.email.trim().to_string();
            config.token = config.token.trim().to_string();
            if config.token.is_empty() || config.email.is_empty() {
                Ok(None)
            } else {
                Ok(Some(config))
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

fn require_config(app: &AppHandle) -> Result<AtlassianConfig, String> {
    read_config(app)?.ok_or_else(|| "Connect Jira in Settings to use Confluence".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn search_cql_escapes_and_scopes_space() {
        assert_eq!(
            build_search_cql(r#"hyper "opt""#, ""),
            r#"type in (page,folder,blogpost) AND text ~ "hyper \"opt\"" ORDER BY lastmodified DESC"#
        );
        assert_eq!(
            build_search_cql("engine", "TB"),
            r#"type in (page,folder,blogpost) AND text ~ "engine" AND space = "TB" ORDER BY lastmodified DESC"#
        );
    }

    #[test]
    fn parses_spaces_and_search() {
        let spaces = parse_spaces(&json!({
            "results": [
                { "id": "1", "key": "TB", "name": "Trading Book" },
                { "id": "2", "key": "ENG", "name": "Engineering" }
            ]
        }));
        assert_eq!(spaces.len(), 2);
        assert_eq!(spaces[0].key, "TB");

        let hits = parse_search_results(
            &json!({
                "results": [{
                    "content": {
                        "id": "99",
                        "type": "page",
                        "title": "Search Engine",
                        "space": { "id": "1", "key": "TB" },
                        "ancestors": [{ "id": "10" }],
                        "_links": { "webui": "/spaces/TB/pages/99/Search+Engine" }
                    }
                }]
            }),
            "https://monly.atlassian.net",
        );
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].id, "99");
        assert_eq!(hits[0].space_key, "TB");
        assert_eq!(hits[0].parent_id, "10");
        assert!(hits[0].readable);
        assert!(hits[0].url.contains("/spaces/TB/pages/99"));
    }

    #[test]
    fn parses_v2_children_and_unsupported_kinds() {
        let nodes = parse_v2_pages(
            &json!({
                "results": [
                    { "id": "1", "title": "Doc", "spaceId": "s", "parentId": "p", "status": "current" },
                    { "folder": { "id": "2", "title": "Technical docs", "spaceId": "s", "parentId": "p" } },
                    { "whiteboard": { "id": "3", "title": "Board", "spaceId": "s" } }
                ]
            }),
            "s",
            "TB",
            "p",
            "https://monly.atlassian.net",
        );
        assert_eq!(nodes.len(), 3);
        assert_eq!(nodes[0].kind, "page");
        assert!(nodes[0].readable);
        assert!(nodes[0].has_children);
        assert_eq!(nodes[1].kind, "folder");
        assert!(nodes[1].has_children);
        assert!(!nodes[1].readable);
        assert_eq!(nodes[2].kind, "whiteboard");
        assert!(!nodes[2].readable);
    }

    #[test]
    fn parses_direct_children_flat_type_payload() {
        let nodes = parse_v2_pages(
            &json!({
                "results": [
                    {
                        "id": "10",
                        "status": "current",
                        "title": "STAGE 5: VALIDATION",
                        "type": "folder",
                        "spaceId": "s",
                        "childPosition": 3
                    },
                    {
                        "id": "11",
                        "status": "current",
                        "title": "Useful Links",
                        "type": "page",
                        "spaceId": "s",
                        "childPosition": 9,
                        "hasChildren": false
                    }
                ]
            }),
            "s",
            "TB",
            "33193986",
            "https://monly.atlassian.net",
        );
        assert_eq!(nodes.len(), 2);
        assert_eq!(nodes[0].kind, "folder");
        assert!(nodes[0].has_children);
        assert_eq!(nodes[0].parent_id, "33193986");
        assert_eq!(nodes[1].kind, "page");
        assert!(!nodes[1].has_children);
        assert!(nodes[1].readable);
    }

    #[test]
    fn child_position_does_not_imply_has_children() {
        let nodes = parse_v2_pages(
            &json!({
                "results": [{
                    "id": "7",
                    "title": "Leaf",
                    "type": "page",
                    "spaceId": "s",
                    "childPosition": 42,
                    "hasChildren": false
                }]
            }),
            "s",
            "TB",
            "1",
            "https://example.atlassian.net",
        );
        assert_eq!(nodes.len(), 1);
        assert!(!nodes[0].has_children);
    }

    #[test]
    fn page_body_from_adf_string() {
        let page = parse_page(
            &json!({
                "id": "42",
                "title": "Blueprint",
                "spaceId": "s",
                "parentId": "1",
                "body": {
                    "atlas_doc_format": {
                        "value": "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"Hello\"}]}]}"
                    }
                },
                "_links": { "webui": "/spaces/TB/pages/42/Blueprint" }
            }),
            "https://monly.atlassian.net",
        )
        .unwrap();
        assert_eq!(page.body, "Hello");
        assert!(page.readable);
        assert!(!page.truncated);
    }

    #[test]
    fn rejects_bad_ids() {
        assert!(!valid_id(""));
        assert!(!valid_id("../x"));
        assert!(valid_id("33193986"));
    }

    #[test]
    fn not_found_prefers_http_status() {
        assert!(HttpError {
            status: Some(404),
            message: "Confluence could not find that page".into(),
        }
        .is_not_found());
        assert!(HttpError {
            status: Some(404),
            message: "totally custom upstream wording".into(),
        }
        .is_not_found());
        assert!(!HttpError {
            status: Some(403),
            message: "denied".into(),
        }
        .is_not_found());
        assert!(HttpError {
            status: None,
            message: "Resource not found".into(),
        }
        .is_not_found());
    }
}
