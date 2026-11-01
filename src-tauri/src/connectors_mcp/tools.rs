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
            "jira_search",
            "Search Jira issues with raw JQL. Optional maxResults (1-100) and fields list (*all allowed).",
            json!({
                "type": "object",
                "properties": {
                    "jql": { "type": "string" },
                    "maxResults": { "type": "integer", "minimum": 1, "maximum": 100 },
                    "fields": { "type": "array", "items": { "type": "string" } }
                },
                "required": ["jql"],
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
            "jira_issue_get",
            "Read a Jira issue with selectable fields. Omit fields for defaults; pass [\"*all\"] for every field. Description is returned as plain text.",
            json!({
                "type": "object",
                "properties": {
                    "key": { "type": "string" },
                    "fields": { "type": "array", "items": { "type": "string" } }
                },
                "required": ["key"],
                "additionalProperties": false
            }),
        ),
        tool(
            "jira_issue_edit",
            "Update Jira issue fields (summary, description, customfield_*, etc.). String description becomes ADF. Returns the updated issue.",
            json!({
                "type": "object",
                "properties": {
                    "key": { "type": "string" },
                    "fields": { "type": "object", "additionalProperties": true }
                },
                "required": ["key", "fields"],
                "additionalProperties": false
            }),
        ),
        tool(
            "jira_issue_create",
            "Create a Jira issue. Use additionalFields for priority, labels, components, and custom fields.",
            json!({
                "type": "object",
                "properties": {
                    "projectKey": { "type": "string" },
                    "issueTypeName": { "type": "string" },
                    "summary": { "type": "string" },
                    "description": { "type": "string" },
                    "parent": { "type": "string" },
                    "additionalFields": { "type": "object", "additionalProperties": true }
                },
                "required": ["projectKey", "issueTypeName", "summary"],
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
            "jira_issue_transitions",
            "List available workflow transitions for a Jira issue.",
            json!({
                "type": "object",
                "properties": { "key": { "type": "string" } },
                "required": ["key"],
                "additionalProperties": false
            }),
        ),
        tool(
            "jira_issue_transition",
            "Transition a Jira issue by transition id. Optional fields for transition screens.",
            json!({
                "type": "object",
                "properties": {
                    "key": { "type": "string" },
                    "transitionId": { "type": "string" },
                    "fields": { "type": "object", "additionalProperties": true }
                },
                "required": ["key", "transitionId"],
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
        tool(
            "confluence_page_create",
            "Create a Confluence page. Provide spaceId (preferred) or spaceKey, title, and body text.",
            json!({
                "type": "object",
                "properties": {
                    "spaceId": { "type": "string" },
                    "spaceKey": { "type": "string" },
                    "title": { "type": "string" },
                    "body": { "type": "string" },
                    "parentId": { "type": "string" }
                },
                "required": ["title", "body"],
                "additionalProperties": false
            }),
        ),
        tool(
            "confluence_page_update",
            "Update a Confluence page title and/or body. Fetches the current version automatically.",
            json!({
                "type": "object",
                "properties": {
                    "id": { "type": "string" },
                    "title": { "type": "string" },
                    "body": { "type": "string" },
                    "versionMessage": { "type": "string" }
                },
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
