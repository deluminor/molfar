use serde_json::{json, Value};

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
