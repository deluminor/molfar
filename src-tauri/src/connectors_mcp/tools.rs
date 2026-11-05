use serde_json::{json, Value};

use crate::confluence;
use crate::jira;

pub(super) fn call_tool(name: &str, arguments: &Value) -> Result<Value, String> {
    match name {
        "jira_list_projects" => {
            let projects = jira::mcp_list_projects()?;
            Ok(json!({ "projects": projects }))
        }
        "jira_list_issues" => {
            let assigned = arguments
                .get("assignedToMe")
                .and_then(Value::as_bool)
                .unwrap_or(false);
            let state = arguments
                .get("state")
                .and_then(Value::as_str)
                .unwrap_or("open");
            let project_ids = arguments
                .get("projectIds")
                .and_then(Value::as_array)
                .map(|items| {
                    items
                        .iter()
                        .filter_map(Value::as_str)
                        .map(str::to_owned)
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            let limit = arguments
                .get("limit")
                .and_then(Value::as_u64)
                .map(|value| value as u32);
            let issues = jira::mcp_list_issues(assigned, state, project_ids, limit)?;
            Ok(json!({ "issues": issues }))
        }
        "jira_search" => {
            let jql = required_string(arguments, "jql")?;
            let max_results = arguments
                .get("maxResults")
                .and_then(Value::as_u64)
                .map(|value| value as u32);
            let fields = string_array(arguments, "fields");
            jira::mcp_search(jql, max_results, fields)
        }
        "jira_issue_details" => {
            let key = required_string(arguments, "key")?;
            let details = jira::mcp_issue_details(key)?;
            Ok(serde_json::to_value(details).map_err(|error| error.to_string())?)
        }
        "jira_issue_get" => {
            let key = required_string(arguments, "key")?;
            let fields = string_array(arguments, "fields");
            jira::mcp_issue_get(key, fields)
        }
        "jira_issue_edit" => {
            let key = required_string(arguments, "key")?;
            let fields = arguments
                .get("fields")
                .ok_or_else(|| "fields is required".to_string())?;
            jira::mcp_issue_edit(key, fields)
        }
        "jira_issue_create" => {
            let project_key = required_string(arguments, "projectKey")?;
            let issue_type_name = required_string(arguments, "issueTypeName")?;
            let summary = required_string(arguments, "summary")?;
            let description = arguments.get("description").and_then(Value::as_str);
            let parent = arguments.get("parent").and_then(Value::as_str);
            let additional_fields = arguments.get("additionalFields");
            jira::mcp_issue_create(
                project_key,
                issue_type_name,
                summary,
                description,
                parent,
                additional_fields,
            )
        }
        "jira_issue_thread" => {
            let key = required_string(arguments, "key")?;
            let thread = jira::mcp_issue_thread(key)?;
            Ok(serde_json::to_value(thread).map_err(|error| error.to_string())?)
        }
        "jira_issue_comment" => {
            let key = required_string(arguments, "key")?;
            let body = required_string(arguments, "body")?;
            let url = jira::mcp_issue_comment(key, body)?;
            Ok(json!({ "url": url }))
        }
        "jira_issue_transitions" => {
            let key = required_string(arguments, "key")?;
            jira::mcp_issue_transitions(key)
        }
        "jira_issue_transition" => {
            let key = required_string(arguments, "key")?;
            let transition_id = required_string(arguments, "transitionId")?;
            let fields = arguments.get("fields");
            jira::mcp_issue_transition(key, transition_id, fields)
        }
        "confluence_search" => {
            let query = required_string(arguments, "query")?;
            let space_key = arguments.get("spaceKey").and_then(Value::as_str);
            let limit = arguments
                .get("limit")
                .and_then(Value::as_u64)
                .map(|value| value as u32);
            let results = confluence::mcp_search(query, space_key, limit)?;
            Ok(json!({ "results": results }))
        }
        "confluence_list" => confluence::mcp_list(
            arguments.get("spaceKey").and_then(Value::as_str),
            arguments.get("spaceId").and_then(Value::as_str),
            arguments.get("parentId").and_then(Value::as_str),
            arguments.get("parentKind").and_then(Value::as_str),
        ),
        "confluence_read" => {
            let id = required_string(arguments, "id")?;
            confluence::mcp_read(id)
        }
        "confluence_page_create" => {
            let title = required_string(arguments, "title")?;
            let body = required_string(arguments, "body")?;
            let space_id = arguments.get("spaceId").and_then(Value::as_str);
            let space_key = arguments.get("spaceKey").and_then(Value::as_str);
            let parent_id = arguments.get("parentId").and_then(Value::as_str);
            confluence::mcp_page_create(space_id, space_key, title, body, parent_id)
        }
        "confluence_page_update" => {
            let id = required_string(arguments, "id")?;
            let title = arguments.get("title").and_then(Value::as_str);
            let body = arguments.get("body").and_then(Value::as_str);
            let version_message = arguments.get("versionMessage").and_then(Value::as_str);
            confluence::mcp_page_update(id, title, body, version_message)
        }
        _ => Err(format!("Unknown tool: {name}")),
    }
}

fn required_string<'a>(arguments: &'a Value, key: &str) -> Result<&'a str, String> {
    arguments
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| format!("{key} is required"))
}

fn string_array(arguments: &Value, key: &str) -> Option<Vec<String>> {
    arguments.get(key).and_then(Value::as_array).map(|items| {
        items
            .iter()
            .filter_map(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_owned)
            .collect()
    })
}
