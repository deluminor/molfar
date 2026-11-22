use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::{json, Value};

use crate::atlassian::{self, Client, Credentials, Error};
const DEFAULT_LIMIT: u32 = 40;
const COMMENT_LIMIT: u32 = 50;
const ISSUE_FIELDS: [&str; 6] = [
    "summary", "status", "updated", "labels", "assignee", "project",
];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JiraStatus {
    pub connected: bool,
    pub site: String,
    pub email: String,
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

pub fn jira_status(app: PathBuf) -> Result<JiraStatus, String> {
    let config = atlassian::load(&app).map_err(|error| error.to_string())?;
    Ok(status_for(config.as_ref()))
}

pub fn jira_set_config(
    app: PathBuf,
    site: String,
    email: String,
    token: String,
) -> Result<JiraStatus, String> {
    if token.trim().is_empty() {
        atlassian::disconnect(&app).map_err(|error| error.to_string())?;
        return Ok(status_for(None));
    }
    let credentials = Credentials::new(&site, &email, &token).map_err(|error| error.to_string())?;
    let status =
        atlassian::test_connection(&app, credentials).map_err(|error| error.to_string())?;
    Ok(JiraStatus {
        connected: true,
        site: status.site,
        email: status.email,
    })
}

pub fn jira_list_projects(app: PathBuf) -> Result<Vec<JiraProject>, String> {
    let config = require_config(&app)?;
    let client = Client::new(&config);
    fetch_jira_projects(|start| {
        jira_get(
            &client,
            &format!("/rest/api/3/project/search?maxResults=100&orderBy=name&startAt={start}"),
        )
    })
}

pub fn jira_list_issues(
    app: PathBuf,
    assigned_to_me: bool,
    state: String,
    project_ids: Vec<String>,
    limit: Option<u32>,
) -> Result<Vec<JiraIssue>, String> {
    let Some(config) = atlassian::load(&app).map_err(|error| error.to_string())? else {
        return Ok(Vec::new());
    };
    let limit = limit.unwrap_or(DEFAULT_LIMIT).clamp(1, 100);
    let jql = issue_jql(assigned_to_me, &state, &project_ids);
    let data = jira_post(
        &Client::new(&config),
        "/rest/api/3/search/jql",
        &json!({ "jql": jql, "maxResults": limit, "fields": ISSUE_FIELDS }),
    )?;
    parse_jira_issues(&data, config.site())
}

pub fn jira_issue_details(app: PathBuf, key: String) -> Result<JiraIssueDetails, String> {
    let config = require_config(&app)?;
    let key = require_issue_key(&key)?;
    let data = jira_get(
        &Client::new(&config),
        &format!("/rest/api/3/issue/{key}?fields=description,reporter,creator,assignee"),
    )?;
    parse_jira_issue_details(&data)
}

pub fn jira_issue_thread(app: PathBuf, key: String) -> Result<JiraIssueThread, String> {
    let config = require_config(&app)?;
    let key = require_issue_key(&key)?;
    // Newest first so a long thread keeps its latest comments; re-sorted below.
    let data = jira_get(
        &Client::new(&config),
        &format!("/rest/api/3/issue/{key}/comment?maxResults={COMMENT_LIMIT}&orderBy=-created"),
    )?;
    parse_jira_issue_thread(&data, config.site(), key)
}

pub fn jira_issue_comment(app: PathBuf, key: String, body: String) -> Result<String, String> {
    let config = require_config(&app)?;
    let key = require_issue_key(&key)?;
    let body = body.trim();
    if body.is_empty() {
        return Err("Comment cannot be empty".into());
    }
    let data = jira_post(
        &Client::new(&config),
        &format!("/rest/api/3/issue/{key}/comment"),
        &json!({ "body": crate::atlassian::adf::from_markdown(body) }),
    )?;
    let id = string_field(&data, "id").unwrap_or_default();
    if id.is_empty() {
        return Err("Could not post Jira comment".into());
    }
    Ok(comment_url(config.site(), key, &id))
}

fn status_for(config: Option<&Credentials>) -> JiraStatus {
    JiraStatus {
        connected: config.is_some(),
        site: config
            .map(|config| config.site().to_owned())
            .unwrap_or_default(),
        email: config
            .map(|config| config.email().to_owned())
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

fn jira_get(client: &Client, path: &str) -> Result<Value, String> {
    client.get(path).map_err(|error| error.to_string())
}

fn jira_post(client: &Client, path: &str, body: &Value) -> Result<Value, String> {
    client.post(path, body).map_err(|error| error.to_string())
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

/// Descriptions and comments arrive as ADF (v3) or plain text; the Inbox renders markdown.
fn rich_text(value: Option<&Value>) -> String {
    match value {
        Some(Value::String(text)) => text.trim().to_string(),
        Some(doc @ Value::Object(_)) => crate::atlassian::adf::to_markdown(doc),
        _ => String::new(),
    }
}

fn require_config(app: &Path) -> Result<Credentials, String> {
    atlassian::load(app)
        .and_then(|credentials| {
            credentials.ok_or_else(|| Error::Invalid("Connect Atlassian in Settings".into()))
        })
        .map_err(|error| error.to_string())
}
