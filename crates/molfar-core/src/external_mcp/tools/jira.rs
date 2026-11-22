use super::{check, schema::*, TargetKind, Tool};
use crate::external_mcp::grants::types::{ACCESS, DOMAIN};
use serde::Deserialize;
use serde_json::{json, Value};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Keyed {
    pub issue_key: String,
    pub fields: Option<Vec<String>>,
    pub char_offset: Option<usize>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Search {
    pub jql: String,
    pub max_results: Option<usize>,
    pub fields: Option<Vec<String>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct List {
    pub assigned_to_me: Option<bool>,
    pub state: Option<String>,
    pub project_ids: Option<Vec<String>>,
    pub limit: Option<usize>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Comment {
    pub issue_key: String,
    pub body: String,
    pub request_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Create {
    pub project_key: String,
    pub summary: String,
    pub description: Option<String>,
    pub request_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Edit {
    pub issue_key: String,
    pub summary: Option<String>,
    pub description: Option<String>,
    pub labels: Option<Vec<String>>,
    pub request_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Transition {
    pub issue_key: String,
    pub transition_id: Option<String>,
    pub request_id: String,
}

pub(super) fn definitions() -> Vec<Tool> {
    let key = || string("Jira issue key");
    let request = || request_id();
    [
        (
            "jira_projects",
            "List Jira projects.",
            false,
            object(json!({}), &[]),
        ),
        (
            "jira_list",
            "List Jira issues for the connected site.",
            false,
            object(
                json!({
                    "assignedToMe": {"type":"boolean"},
                    "state": string("Status name"),
                    "projectIds": {"type":"array","items":string("Project key")},
                    "limit": integer("1–100")
                }),
                &[],
            ),
        ),
        (
            "jira_search",
            "Search Jira issues with JQL.",
            false,
            object(
                json!({
                    "jql": string("JQL"),
                    "maxResults": integer("1–100"),
                    "fields": {"type":"array","items":string("Field name or *all")}
                }),
                &["jql"],
            ),
        ),
        (
            "jira_get",
            "Read one Jira issue. Description is Markdown.",
            false,
            object(
                json!({
                    "issueKey": key(),
                    "fields": {"type":"array","items":string("Field name or *all")}
                }),
                &["issueKey"],
            ),
        ),
        (
            "jira_thread",
            "Read Jira comments, at most 6000 characters per page.",
            false,
            object(
                json!({
                    "issueKey": key(),
                    "charOffset": integer("nextCharOffset from a previous page")
                }),
                &["issueKey"],
            ),
        ),
        (
            "jira_comment",
            "Comment on a Jira issue.",
            true,
            object(
                json!({
                    "issueKey": key(),
                    "body": string("Comment text"),
                    "requestId": request()
                }),
                &["issueKey", "body", "requestId"],
            ),
        ),
        (
            "jira_create",
            "Create a Jira issue.",
            true,
            object(
                json!({
                    "projectKey": string("Project key"),
                    "summary": string("Summary"),
                    "description": string("Description"),
                    "requestId": request()
                }),
                &["projectKey", "summary", "requestId"],
            ),
        ),
        (
            "jira_edit",
            "Edit a Jira issue summary, description, or labels.",
            true,
            object(
                json!({
                    "issueKey": key(),
                    "summary": string("Summary"),
                    "description": string("Description"),
                    "labels": {"type":"array","items":string("Label")},
                    "requestId": request()
                }),
                &["issueKey", "requestId"],
            ),
        ),
        (
            "jira_transitions",
            "List transitions for a Jira issue.",
            true,
            object(
                json!({
                    "issueKey": key(),
                    "requestId": request()
                }),
                &["issueKey", "requestId"],
            ),
        ),
        (
            "jira_transition",
            "Transition a Jira issue.",
            true,
            object(
                json!({
                    "issueKey": key(),
                    "transitionId": string("Transition id"),
                    "requestId": request()
                }),
                &["issueKey", "transitionId", "requestId"],
            ),
        ),
    ]
    .into_iter()
    .map(|(name, description, mutation, schema)| {
        let mut tool = Tool::domain(
            name,
            description,
            DOMAIN::Jira,
            TargetKind::None,
            mutation,
            if mutation {
                ACCESS::Delegated
            } else {
                ACCESS::Standard
            },
            schema,
        );
        tool.resumable = !mutation;
        tool
    })
    .collect()
}

pub(super) fn validate(name: &str, arguments: &Value) -> Result<(), String> {
    match name {
        "jira_projects" => check::<Empty>(arguments),
        "jira_list" => check::<List>(arguments),
        "jira_search" => check::<Search>(arguments),
        "jira_get" | "jira_thread" => check::<Keyed>(arguments),
        "jira_comment" => check::<Comment>(arguments),
        "jira_create" => check::<Create>(arguments),
        "jira_edit" => check::<Edit>(arguments),
        "jira_transitions" | "jira_transition" => check::<Transition>(arguments),
        _ => Err("Unknown Jira tool.".into()),
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Empty {}
