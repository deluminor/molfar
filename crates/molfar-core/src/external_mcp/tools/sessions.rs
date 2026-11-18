use super::{schema::*, Tool};
use crate::external_mcp::grants::types::{Requirement, DOMAIN, GRANT};
use serde_json::json;

use serde::Deserialize;
use serde_json::Value;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SessionsList {
    pub project: String,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SessionsRead {
    pub session_id: Value,
    pub before: Option<Value>,
    pub limit: Option<u32>,
    pub max_chars: Option<u32>,
    pub char_offset: Option<u32>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SessionsStart {
    pub project: String,
    pub prompt: String,
    pub title: Option<String>,
    pub request_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SessionsSend {
    pub session_id: Value,
    pub prompt: String,
    pub request_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SessionsStop {
    pub session_id: Value,
    pub request_id: String,
}

pub(super) fn definitions() -> Vec<Tool> {
    vec![
        Tool { name: "sessions_list", requires: Requirement::standard(&[GRANT::Read(DOMAIN::Sessions)]), mutation: false, description: "List a project's sessions with their status.", schema: object(json!({"project":string("Project path from projects_list"),"limit":integer("1-100, default 30"),"offset":integer("Entries to skip")}), &["project"]) },
        Tool { name: "sessions_read", requires: Requirement::standard(&[GRANT::Read(DOMAIN::Sessions)]), mutation: false, description: "Read a session's status and recent exchanges. Pending approvals must be resolved in MOLFAR.", schema: object(json!({"sessionId":{"type":["string","integer"]},"before":{"type":["string","integer"],"description":"nextBefore from a previous page"},"limit":integer("1-3 exchanges"),"maxChars":integer("200-6000 per message"),"charOffset":integer("nextCharOffset from a previous page")}), &["sessionId"]) },
        Tool { name: "sessions_start", requires: Requirement::standard(&[GRANT::Write(DOMAIN::Sessions)]), mutation: true, description: "Start a session in a granted project with MOLFAR's default harness, model and runtime.", schema: object(json!({"project":string("Project path from projects_list"),"prompt":string("The task"),"title":string("Optional title"),"requestId":request_id()}), &["project","prompt","requestId"]) },
        Tool { name: "sessions_send", requires: Requirement::standard(&[GRANT::Write(DOMAIN::Sessions)]), mutation: true, description: "Send a follow-up to an idle session. A busy session returns an error and nothing is sent.", schema: object(json!({"sessionId":{"type":["string","integer"]},"prompt":string("The follow-up"),"requestId":request_id()}), &["sessionId","prompt","requestId"]) },
        Tool { name: "sessions_stop", requires: Requirement::standard(&[GRANT::SessionsStop]), mutation: true, description: "Stop a session's running turn. History is kept.", schema: object(json!({"sessionId":{"type":["string","integer"]},"requestId":request_id()}), &["sessionId","requestId"]) },
    ]
}
