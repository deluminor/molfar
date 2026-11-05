use serde_json::{json, Value};

use super::write::{fields_query, summarize_issue_payload, DEFAULT_ISSUE_GET_FIELDS};
use super::*;

pub(crate) fn mcp_list_projects() -> Result<Vec<JiraProject>, String> {
    let config = require_disk_config()?;
    fetch_jira_projects(|start| {
        jira_get(
            &config,
            &format!("/rest/api/3/project/search?maxResults=100&orderBy=name&startAt={start}"),
        )
    })
}

pub(crate) fn mcp_list_issues(
    assigned_to_me: bool,
    state: &str,
    project_ids: Vec<String>,
    limit: Option<u32>,
) -> Result<Vec<JiraIssue>, String> {
    let Some(config) = read_disk_config()? else {
        return Ok(Vec::new());
    };
    let limit = limit.unwrap_or(DEFAULT_LIMIT).clamp(1, 100);
    let jql = issue_jql(assigned_to_me, state, &project_ids);
    let data = jira_post(
        &config,
        "/rest/api/3/search/jql",
        &json!({ "jql": jql, "maxResults": limit, "fields": ISSUE_FIELDS }),
    )?;
    parse_jira_issues(&data, &config.site)
}

pub(crate) fn mcp_issue_details(key: &str) -> Result<JiraIssueDetails, String> {
    let config = require_disk_config()?;
    let key = require_issue_key(key)?;
    let data = jira_get(
        &config,
        &format!("/rest/api/3/issue/{key}?fields=description,reporter,creator,assignee"),
    )?;
    parse_jira_issue_details(&data)
}

pub(crate) fn mcp_issue_thread(key: &str) -> Result<JiraIssueThread, String> {
    let config = require_disk_config()?;
    let key = require_issue_key(key)?;
    let data = jira_get(
        &config,
        &format!("/rest/api/3/issue/{key}/comment?maxResults={COMMENT_LIMIT}&orderBy=-created"),
    )?;
    parse_jira_issue_thread(&data, &config.site, key)
}

pub(crate) fn mcp_issue_get(key: &str, fields: Option<Vec<String>>) -> Result<Value, String> {
    let config = require_disk_config()?;
    let key = require_issue_key(key)?;
    let query = fields_query(fields.as_deref()).replace('*', "%2A");
    let data = jira_get(&config, &format!("/rest/api/3/issue/{key}?fields={query}"))?;
    summarize_issue_payload(&config.site, &data)
}

pub(crate) fn mcp_search(
    jql: &str,
    max_results: Option<u32>,
    fields: Option<Vec<String>>,
) -> Result<Value, String> {
    let config = require_disk_config()?;
    let jql = jql.trim();
    if jql.is_empty() {
        return Err("jql is required".into());
    }
    let max_results = max_results.unwrap_or(DEFAULT_LIMIT).clamp(1, 100);
    let field_list = match fields {
        None => DEFAULT_ISSUE_GET_FIELDS
            .iter()
            .map(|field| (*field).to_string())
            .collect::<Vec<_>>(),
        Some(list) if list.is_empty() => DEFAULT_ISSUE_GET_FIELDS
            .iter()
            .map(|field| (*field).to_string())
            .collect::<Vec<_>>(),
        Some(list) if list.iter().any(|field| field.trim() == "*all") => {
            vec!["*all".into()]
        }
        Some(list) => list,
    };
    let data = jira_post(
        &config,
        "/rest/api/3/search/jql",
        &json!({
            "jql": jql,
            "maxResults": max_results,
            "fields": field_list,
        }),
    )?;
    let issues = data
        .get("issues")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|issue| summarize_issue_payload(&config.site, &issue).ok())
        .collect::<Vec<_>>();
    Ok(json!({
        "jql": jql,
        "total": data.get("total").cloned().unwrap_or_else(|| json!(issues.len())),
        "issues": issues,
    }))
}
