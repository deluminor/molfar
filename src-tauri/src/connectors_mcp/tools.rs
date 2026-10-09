use serde_json::{json, Value};

use crate::confluence;
use crate::jira;

pub(super) fn tool_definitions() -> Vec<Value> {
    vec![
        tool(
            "jira_list_projects",
            "List Jira projects available to the connected Atlassian account.",
            json!({ "type": "object", "properties": {}, "additionalProperties": false }),
        ),
        tool(
            "jira_list_issues",
            "List Jira issues. Optional filters: assignedToMe, state (open|all), projectIds, limit.",
            json!({
                "type": "object",
                "properties": {
                    "assignedToMe": { "type": "boolean" },
                    "state": { "type": "string" },
                    "projectIds": { "type": "array", "items": { "type": "string" } },
                    "limit": { "type": "integer", "minimum": 1, "maximum": 100 }
                },
                "additionalProperties": false
            }),
        ),
        tool(
            "jira_issue_details",
            "Read a Jira issue description and reporter by issue key (e.g. ENG-42).",
            json!({
                "type": "object",
                "properties": { "key": { "type": "string" } },
                "required": ["key"],
                "additionalProperties": false
            }),
        ),
        tool(
            "jira_issue_thread",
            "Read comments on a Jira issue by key.",
            json!({
                "type": "object",
                "properties": { "key": { "type": "string" } },
                "required": ["key"],
                "additionalProperties": false
            }),
        ),
        tool(
            "jira_issue_comment",
            "Post a comment on a Jira issue. Returns the comment URL.",
            json!({
                "type": "object",
                "properties": {
                    "key": { "type": "string" },
                    "body": { "type": "string" }
                },
                "required": ["key", "body"],
                "additionalProperties": false
            }),
        ),
        tool(
            "confluence_search",
            "Search Confluence pages and folders (requires Jira connection).",
            json!({
                "type": "object",
                "properties": {
                    "query": { "type": "string" },
                    "spaceKey": { "type": "string" },
                    "limit": { "type": "integer", "minimum": 1, "maximum": 50 }
                },
                "required": ["query"],
                "additionalProperties": false
            }),
        ),
        tool(
            "confluence_list",
            "List Confluence space roots or children of a page/folder.",
            json!({
                "type": "object",
                "properties": {
                    "spaceKey": { "type": "string" },
                    "spaceId": { "type": "string" },
                    "parentId": { "type": "string" },
                    "parentKind": { "type": "string" }
                },
                "additionalProperties": false
            }),
        ),
        tool(
            "confluence_read",
            "Read a Confluence page body as markdown, or folder children when not readable.",
            json!({
                "type": "object",
                "properties": { "id": { "type": "string" } },
                "required": ["id"],
                "additionalProperties": false
            }),
        ),
    ]
}

fn tool(name: &str, description: &str, input_schema: Value) -> Value {
    json!({
        "name": name,
        "description": description,
        "inputSchema": input_schema,
    })
}

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
        "jira_issue_details" => {
            let key = required_string(arguments, "key")?;
            let details = jira::mcp_issue_details(key)?;
            Ok(serde_json::to_value(details).map_err(|error| error.to_string())?)
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
