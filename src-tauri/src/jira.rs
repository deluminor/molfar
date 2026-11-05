use std::fs;
use std::path::{Path, PathBuf};

use base64::Engine as _;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

use crate::atlassian_adf::rich_text;
use crate::http_client::{self, HttpFailure, Redirects};

mod mcp;
mod mcp_write;
mod write;

use write::text_to_adf;

pub(crate) use mcp::{
    mcp_issue_details, mcp_issue_get, mcp_issue_thread, mcp_list_issues, mcp_list_projects,
    mcp_search,
};
pub(crate) use mcp_write::{
    mcp_issue_comment, mcp_issue_create, mcp_issue_edit, mcp_issue_transition,
    mcp_issue_transitions,
};

const DEFAULT_LIMIT: u32 = 40;
const COMMENT_LIMIT: u32 = 50;
const ISSUE_FIELDS: [&str; 8] = [
    "summary",
    "status",
    "updated",
    "labels",
    "assignee",
    "project",
    "issuetype",
    "parent",
];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JiraStatus {
    pub connected: bool,
    pub site: String,
    pub email: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct JiraConfig {
    pub(crate) site: String,
    pub(crate) email: String,
    pub(crate) token: String,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct JiraProject {
    pub id: String,
    pub key: String,
    pub name: String,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct JiraLabel {
    pub name: String,
    pub color: String,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct JiraAssignee {
    pub login: String,
    pub avatar_url: String,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct JiraIssue {
    pub provider: String,
    pub kind: String,
    pub id: String,
    pub identifier: String,
    pub number: i64,
    pub title: String,
    pub url: String,
    pub state: String,
    pub state_type: String,
    pub updated_at: String,
    pub labels: Vec<JiraLabel>,
    pub assignees: Vec<JiraAssignee>,
    pub draft: bool,
    pub repo: String,
    pub team_id: String,
    pub team_name: String,
    pub project_path: String,
    /// Jira issue type display name (Epic, Story, Task, …).
    pub issue_type: String,
    /// Jira hierarchy level when present (Epic often 1, Story/Task 0, Sub-task -1).
    pub issue_type_hierarchy_level: Option<i64>,
    /// Parent issue key when this issue nests under another.
    pub parent_key: String,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct JiraIssueDetails {
    pub body: String,
    pub author: String,
    pub author_avatar_url: String,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct JiraIssueComment {
    pub id: String,
    pub kind: String,
    pub author: String,
    pub author_avatar_url: String,
    pub body: String,
    pub created_at: String,
    pub url: String,
    pub state: String,
    pub path: String,
    pub line: Option<i64>,
    pub resolved: bool,
    pub thread_id: String,
    pub replies: Vec<JiraIssueComment>,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct JiraIssueThread {
    pub comments: Vec<JiraIssueComment>,
    pub truncated: bool,
    pub review_decision: String,
    pub base_ref_name: String,
    pub head_ref_name: String,
}

#[tauri::command(async)]
pub fn jira_status(app: AppHandle) -> Result<JiraStatus, String> {
    let config = read_config(&app)?;
    Ok(status_for(config.as_ref()))
}

#[tauri::command]
pub async fn jira_set_config(
    app: AppHandle,
    site: String,
    email: String,
    token: String,
) -> Result<JiraStatus, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let token = token.trim().to_string();
        if token.is_empty() {
            delete_config(&app)?;
            return Ok(status_for(None));
        }
        let email = email.trim().to_string();
        if email.is_empty() || !email.contains('@') {
            return Err("Enter the email address of your Atlassian account".into());
        }
        let config = JiraConfig {
            site: normalize_jira_site(&site)?,
            email,
            token,
        };
        let myself = jira_get(&config, "/rest/api/3/myself")?;
        if string_field(&myself, "accountId")
            .unwrap_or_default()
            .is_empty()
        {
            return Err("Jira did not return the current user".into());
        }
        write_config(&app, &config)?;
        Ok(status_for(Some(&config)))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn jira_list_projects(app: AppHandle) -> Result<Vec<JiraProject>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let config = require_config(&app)?;
        fetch_jira_projects(|start| {
            jira_get(
                &config,
                &format!("/rest/api/3/project/search?maxResults=100&orderBy=name&startAt={start}"),
            )
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn jira_list_issues(
    app: AppHandle,
    assigned_to_me: bool,
    state: String,
    project_ids: Vec<String>,
    limit: Option<u32>,
) -> Result<Vec<JiraIssue>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(config) = read_config(&app)? else {
            return Ok(Vec::new());
        };
        let limit = limit.unwrap_or(DEFAULT_LIMIT).clamp(1, 100);
        let jql = issue_jql(assigned_to_me, &state, &project_ids);
        let data = jira_post(
            &config,
            "/rest/api/3/search/jql",
            &json!({ "jql": jql, "maxResults": limit, "fields": ISSUE_FIELDS }),
        )?;
        parse_jira_issues(&data, &config.site)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn jira_issue_details(app: AppHandle, key: String) -> Result<JiraIssueDetails, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let config = require_config(&app)?;
        let key = require_issue_key(&key)?;
        let data = jira_get(
            &config,
            &format!("/rest/api/3/issue/{key}?fields=description,reporter,creator,assignee"),
        )?;
        parse_jira_issue_details(&data)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn jira_issue_thread(app: AppHandle, key: String) -> Result<JiraIssueThread, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let config = require_config(&app)?;
        let key = require_issue_key(&key)?;
        // Newest first so a long thread keeps its latest comments; re-sorted below.
        let data = jira_get(
            &config,
            &format!("/rest/api/3/issue/{key}/comment?maxResults={COMMENT_LIMIT}&orderBy=-created"),
        )?;
        parse_jira_issue_thread(&data, &config.site, key)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn jira_issue_comment(
    app: AppHandle,
    key: String,
    body: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let config = require_config(&app)?;
        let key = require_issue_key(&key)?;
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
    })
    .await
    .map_err(|error| error.to_string())?
}

fn status_for(config: Option<&JiraConfig>) -> JiraStatus {
    JiraStatus {
        connected: config.is_some(),
        site: config.map(|config| config.site.clone()).unwrap_or_default(),
        email: config
            .map(|config| config.email.clone())
            .unwrap_or_default(),
    }
}

fn issue_jql(assigned_to_me: bool, state: &str, project_ids: &[String]) -> String {
    let mut clauses = Vec::new();
    if assigned_to_me {
        clauses.push("assignee = currentUser()".to_string());
    }
    let ids: Vec<&str> = project_ids
        .iter()
        .map(|id| id.trim())
        .filter(|id| !id.is_empty() && id.chars().all(|ch| ch.is_ascii_digit()))
        .collect();
    if !ids.is_empty() {
        clauses.push(format!("project in ({})", ids.join(", ")));
    }
    if !state.trim().eq_ignore_ascii_case("all") {
        clauses.push("statusCategory != Done".to_string());
    }
    // The search endpoint rejects unbounded JQL, so an unfiltered query is
    // limited to the last year of activity.
    if clauses.is_empty() {
        clauses.push("updated >= -365d".to_string());
    }
    format!("{} ORDER BY updated DESC", clauses.join(" AND "))
}

fn jira_authorization(config: &JiraConfig) -> String {
    let encoded = base64::engine::general_purpose::STANDARD.encode(format!(
        "{}:{}",
        config.email.trim(),
        config.token.trim()
    ));
    format!("Basic {encoded}")
}

fn jira_get(config: &JiraConfig, path: &str) -> Result<Value, String> {
    let result = http_client::agent(Redirects::Follow)
        .get(&format!("{}{path}", config.site))
        .set("Authorization", &jira_authorization(config))
        .set("Accept", "application/json")
        .call();
    read_jira_response(result)
}

fn jira_post(config: &JiraConfig, path: &str, body: &Value) -> Result<Value, String> {
    let payload = serde_json::to_string(body).map_err(|error| error.to_string())?;
    let result = http_client::agent(Redirects::Follow)
        .post(&format!("{}{path}", config.site))
        .set("Authorization", &jira_authorization(config))
        .set("Accept", "application/json")
        .set("Content-Type", "application/json")
        .send_string(&payload);
    read_jira_response(result)
}

fn jira_put(config: &JiraConfig, path: &str, body: &Value) -> Result<Value, String> {
    let payload = serde_json::to_string(body).map_err(|error| error.to_string())?;
    let result = http_client::agent(Redirects::Follow)
        .put(&format!("{}{path}", config.site))
        .set("Authorization", &jira_authorization(config))
        .set("Accept", "application/json")
        .set("Content-Type", "application/json")
        .send_string(&payload);
    read_jira_response(result)
}

fn read_jira_response(result: Result<ureq::Response, ureq::Error>) -> Result<Value, String> {
    let response = match http_client::response(result) {
        Ok(response) => response,
        Err(HttpFailure::Status { status: 401, .. }) => {
            return Err("Jira email or API token is invalid".into());
        }
        Err(HttpFailure::Status { status, body }) => return Err(jira_http_error(status, &body)),
        Err(HttpFailure::Unreachable) => return Err("Could not reach Jira".into()),
    };
    let (status, body) = http_client::text(response, "Jira")?;
    if !http_client::is_success(status) {
        return Err(jira_http_error(status, &body));
    }
    if body.trim().is_empty() {
        return Ok(json!({}));
    }
    serde_json::from_str(&body).map_err(|_| "Jira returned invalid JSON".to_string())
}

fn jira_http_error(status: u16, body: &str) -> String {
    if let Some(message) = jira_error_message(body) {
        return message;
    }
    match status {
        403 => "Jira denied access. Check the API token's permissions".into(),
        404 => "Jira could not find that issue".into(),
        _ => format!("Jira request failed ({status})"),
    }
}

fn jira_error_message(body: &str) -> Option<String> {
    let parsed: Value = serde_json::from_str(body).ok()?;
    let from_list = parsed
        .get("errorMessages")
        .and_then(Value::as_array)
        .and_then(|messages| messages.iter().filter_map(Value::as_str).next())
        .map(str::to_string);
    let from_map = || {
        parsed
            .get("errors")
            .and_then(Value::as_object)
            .and_then(|errors| errors.values().filter_map(Value::as_str).next())
            .map(str::to_string)
    };
    from_list
        .or_else(from_map)
        .map(|message| message.trim().to_string())
        .filter(|message| !message.is_empty())
}

fn parse_jira_projects(data: &Value) -> Result<Vec<JiraProject>, String> {
    let values = data
        .get("values")
        .and_then(Value::as_array)
        .ok_or_else(|| "Jira did not return projects".to_string())?;
    Ok(values
        .iter()
        .filter_map(|value| {
            let id = string_field(value, "id").filter(|id| !id.is_empty())?;
            let key = string_field(value, "key").unwrap_or_default();
            let name = string_field(value, "name")
                .filter(|name| !name.is_empty())
                .unwrap_or_else(|| key.clone());
            Some(JiraProject { id, key, name })
        })
        .collect())
}

// Follow every page: a partial project list would silently exclude visible
// projects when converting hidden projects into the JQL allowlist.
fn fetch_jira_projects(
    mut fetch: impl FnMut(u64) -> Result<Value, String>,
) -> Result<Vec<JiraProject>, String> {
    let mut start = 0;
    let mut projects = Vec::new();
    loop {
        let data = fetch(start)?;
        let page = parse_jira_projects(&data)?;
        let count = data["values"].as_array().map_or(0, Vec::len) as u64;
        projects.extend(page);
        if data["isLast"].as_bool() == Some(true) {
            break;
        }
        let next = data["startAt"].as_u64().unwrap_or(start) + count;
        if data["total"].as_u64().is_some_and(|total| next >= total) {
            break;
        }
        if count == 0 || next <= start {
            if data["isLast"].as_bool() == Some(false) {
                return Err("Jira project pagination did not advance".into());
            }
            break;
        }
        start = next;
    }
    let mut seen = std::collections::HashSet::new();
    projects.retain(|project| seen.insert(project.id.clone()));
    Ok(projects)
}

fn parse_jira_issues(data: &Value, site: &str) -> Result<Vec<JiraIssue>, String> {
    let issues = data
        .get("issues")
        .and_then(Value::as_array)
        .ok_or_else(|| "Jira did not return issues".to_string())?;
    Ok(issues
        .iter()
        .filter_map(|issue| parse_jira_issue(issue, site))
        .collect())
}

fn parse_jira_issue(node: &Value, site: &str) -> Option<JiraIssue> {
    let id = string_field(node, "id").filter(|id| !id.is_empty())?;
    let key = string_field(node, "key").filter(|key| !key.is_empty())?;
    let fields = node.get("fields").cloned().unwrap_or(Value::Null);
    let project = fields.get("project");
    let status = fields.get("status");
    let labels = fields
        .get("labels")
        .and_then(Value::as_array)
        .map(|labels| {
            labels
                .iter()
                .filter_map(Value::as_str)
                .map(|name| JiraLabel {
                    name: name.to_string(),
                    color: String::new(),
                })
                .collect()
        })
        .unwrap_or_default();
    let (assignee, avatar_url) = person_fields(fields.get("assignee"));
    let issue_type = fields.get("issuetype");
    Some(JiraIssue {
        provider: "jira".into(),
        kind: "jira".into(),
        number: issue_number(&key),
        url: format!("{site}/browse/{key}"),
        title: string_field(&fields, "summary").unwrap_or_default(),
        state: status
            .and_then(|value| string_field(value, "name"))
            .unwrap_or_else(|| "Open".into()),
        state_type: status
            .and_then(|value| value.pointer("/statusCategory/key"))
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        updated_at: normalize_jira_time(&string_field(&fields, "updated").unwrap_or_default()),
        labels,
        assignees: assignee
            .map(|login| vec![JiraAssignee { login, avatar_url }])
            .unwrap_or_default(),
        draft: false,
        repo: project
            .and_then(|value| string_field(value, "key"))
            .unwrap_or_default(),
        team_id: project
            .and_then(|value| string_field(value, "id"))
            .unwrap_or_default(),
        team_name: project
            .and_then(|value| string_field(value, "name"))
            .unwrap_or_default(),
        project_path: String::new(),
        issue_type: issue_type
            .and_then(|value| string_field(value, "name"))
            .unwrap_or_default(),
        issue_type_hierarchy_level: issue_type
            .and_then(|value| value.get("hierarchyLevel"))
            .and_then(Value::as_i64),
        parent_key: fields
            .get("parent")
            .and_then(|value| string_field(value, "key"))
            .unwrap_or_default(),
        id,
        identifier: key,
    })
}

fn parse_jira_issue_details(data: &Value) -> Result<JiraIssueDetails, String> {
    let fields = data
        .get("fields")
        .ok_or_else(|| "Jira did not return that issue".to_string())?;
    let (author, author_avatar_url) = [fields.get("reporter"), fields.get("creator")]
        .into_iter()
        .map(person_fields)
        .find(|(name, _)| name.is_some())
        .unwrap_or_else(|| person_fields(fields.get("assignee")));
    Ok(JiraIssueDetails {
        body: rich_text(fields.get("description")),
        author: author.unwrap_or_default(),
        author_avatar_url,
    })
}

fn parse_jira_issue_thread(data: &Value, site: &str, key: &str) -> Result<JiraIssueThread, String> {
    let comments = data
        .get("comments")
        .and_then(Value::as_array)
        .ok_or_else(|| "Jira did not return comments".to_string())?;
    let total = data
        .get("total")
        .and_then(Value::as_u64)
        .unwrap_or(comments.len() as u64);
    let mut parsed: Vec<JiraIssueComment> = comments
        .iter()
        .filter_map(|comment| parse_jira_comment(comment, site, key))
        .collect();
    parsed.sort_by(|left, right| left.created_at.cmp(&right.created_at));
    Ok(JiraIssueThread {
        truncated: total > comments.len() as u64,
        comments: parsed,
        review_decision: String::new(),
        base_ref_name: String::new(),
        head_ref_name: String::new(),
    })
}

fn parse_jira_comment(node: &Value, site: &str, key: &str) -> Option<JiraIssueComment> {
    let id = string_field(node, "id").filter(|id| !id.is_empty())?;
    let (author, author_avatar_url) = person_fields(node.get("author"));
    Some(JiraIssueComment {
        url: comment_url(site, key, &id),
        kind: "comment".into(),
        author: author.unwrap_or_default(),
        author_avatar_url,
        body: rich_text(node.get("body")),
        created_at: normalize_jira_time(&string_field(node, "created").unwrap_or_default()),
        state: String::new(),
        path: String::new(),
        line: None,
        resolved: false,
        thread_id: String::new(),
        replies: Vec::new(),
        id,
    })
}

fn comment_url(site: &str, key: &str, id: &str) -> String {
    format!("{site}/browse/{key}?focusedCommentId={id}")
}

fn issue_number(key: &str) -> i64 {
    key.rsplit('-')
        .next()
        .and_then(|number| number.parse().ok())
        .unwrap_or(0)
}

/// Jira sends `+0000` offsets, which WebKit's `Date.parse` rejects.
fn normalize_jira_time(value: &str) -> String {
    let bytes = value.as_bytes();
    let len = bytes.len();
    if len > 5
        && matches!(bytes[len - 5], b'+' | b'-')
        && bytes[len - 4..].iter().all(u8::is_ascii_digit)
    {
        return format!("{}:{}", &value[..len - 2], &value[len - 2..]);
    }
    value.to_string()
}

fn require_issue_key(key: &str) -> Result<&str, String> {
    let key = key.trim();
    let valid = !key.is_empty()
        && key.len() < 64
        && key
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_'));
    if valid {
        Ok(key)
    } else {
        Err("Missing Jira issue".into())
    }
}

fn person_fields(node: Option<&Value>) -> (Option<String>, String) {
    let Some(node) = node.filter(|node| node.is_object()) else {
        return (None, String::new());
    };
    (
        string_field(node, "displayName").filter(|name| !name.is_empty()),
        node.pointer("/avatarUrls/48x48")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
    )
}

fn string_field(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(|text| text.trim().to_string())
}

// ---- Config storage ----

fn normalize_jira_site(raw: &str) -> Result<String, String> {
    let raw = raw.trim().trim_end_matches('/');
    if raw.is_empty() {
        return Err("Enter your Jira site (e.g. yourteam.atlassian.net)".into());
    }
    // Bare `yourteam` becomes the Atlassian Cloud site.
    let with_scheme = if raw.contains("://") {
        raw.to_string()
    } else if raw.contains('.') {
        format!("https://{raw}")
    } else {
        format!("https://{raw}.atlassian.net")
    };
    let url = url::Url::parse(&with_scheme).map_err(|_| "Jira site is invalid".to_string())?;
    // The API token travels on every request as Basic auth.
    if url.scheme() != "https" {
        return Err("Jira site must use HTTPS".into());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("Jira site is invalid".into());
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

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("jira-config.json"))
}

/// Same vault file Tauri commands use — for CLI MCP without an AppHandle.
pub(crate) fn disk_config_path() -> Result<PathBuf, String> {
    Ok(crate::app_identity::app_data_dir()?.join("jira-config.json"))
}

fn parse_config_raw(raw: &str) -> Result<Option<JiraConfig>, String> {
    let mut config: JiraConfig =
        serde_json::from_str(raw).map_err(|_| "Jira settings are invalid".to_string())?;
    config.site = normalize_jira_site(&config.site)?;
    config.email = config.email.trim().to_string();
    config.token = config.token.trim().to_string();
    if config.token.is_empty() || config.email.is_empty() {
        Ok(None)
    } else {
        Ok(Some(config))
    }
}

fn read_config_at(path: &Path) -> Result<Option<JiraConfig>, String> {
    match fs::read_to_string(path) {
        Ok(raw) => parse_config_raw(&raw),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

fn read_config(app: &AppHandle) -> Result<Option<JiraConfig>, String> {
    read_config_at(&config_path(app)?)
}

pub(crate) fn read_disk_config() -> Result<Option<JiraConfig>, String> {
    read_config_at(&disk_config_path()?)
}

pub(crate) fn is_connected_on_disk() -> bool {
    read_disk_config().ok().flatten().is_some()
}

fn require_config(app: &AppHandle) -> Result<JiraConfig, String> {
    read_config(app)?.ok_or_else(|| "Connect Jira in Settings".to_string())
}

fn require_disk_config() -> Result<JiraConfig, String> {
    read_disk_config()?.ok_or_else(|| "Connect Jira in Settings".to_string())
}

fn write_config(app: &AppHandle, config: &JiraConfig) -> Result<(), String> {
    let path = config_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let value = serde_json::to_string(config).map_err(|error| error.to_string())?;
    write_secret_file(&path, &value)
}

fn delete_config(app: &AppHandle) -> Result<(), String> {
    let path = config_path(app)?;
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

fn write_secret_file(path: &Path, value: &str) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::io::Write;
        use std::os::unix::fs::OpenOptionsExt;
        let mut file = fs::OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .mode(0o600)
            .open(path)
            .map_err(|error| error.to_string())?;
        file.write_all(value.as_bytes())
            .map_err(|error| error.to_string())?;
        Ok(())
    }
    #[cfg(not(unix))]
    {
        fs::write(path, value).map_err(|error| error.to_string())
    }
}

#[cfg(test)]
mod tests;
