use super::{
    grants::types::{Requirement, DOMAIN, GRANT},
    types::Principal,
};
use serde::{de::DeserializeOwned, Deserialize};
use serde_json::{json, Value};

pub struct Tool {
    pub name: &'static str,
    pub requires: Requirement,
    pub mutation: bool,
    pub description: &'static str,
    pub schema: Value,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Empty {}

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

fn string(description: &str) -> Value {
    json!({"type":"string","description":description})
}

fn integer(description: &str) -> Value {
    json!({"type":"integer","minimum":0,"description":description})
}

fn object(properties: Value, required: &[&str]) -> Value {
    json!({"type":"object","properties":properties,"required":required,"additionalProperties":false})
}

fn request_id() -> Value {
    json!({"type":"string","minLength":1,"maxLength":128,"description":"Stable ID; retry an uncertain call with the same ID and identical input"})
}

fn build_catalog() -> Vec<Tool> {
    vec![
        Tool { name: "projects_list", requires: Requirement::standard(&[GRANT::Read(DOMAIN::Board), GRANT::Read(DOMAIN::Sessions)]), mutation: false, description: "List the MOLFAR projects this client may use.", schema: object(json!({}), &[]) },
        Tool { name: "sessions_list", requires: Requirement::standard(&[GRANT::Read(DOMAIN::Sessions)]), mutation: false, description: "List a project's sessions with their status.", schema: object(json!({"project":string("Project path from projects_list"),"limit":integer("1-100, default 30"),"offset":integer("Entries to skip")}), &["project"]) },
        Tool { name: "sessions_read", requires: Requirement::standard(&[GRANT::Read(DOMAIN::Sessions)]), mutation: false, description: "Read a session's status and recent exchanges. Pending approvals must be resolved in MOLFAR.", schema: object(json!({"sessionId":{"type":["string","integer"]},"before":{"type":["string","integer"],"description":"nextBefore from a previous page"},"limit":integer("1-3 exchanges"),"maxChars":integer("200-6000 per message"),"charOffset":integer("nextCharOffset from a previous page")}), &["sessionId"]) },
        Tool { name: "sessions_start", requires: Requirement::standard(&[GRANT::Write(DOMAIN::Sessions)]), mutation: true, description: "Start a session in a granted project with MOLFAR's default harness, model and runtime.", schema: object(json!({"project":string("Project path from projects_list"),"prompt":string("The task"),"title":string("Optional title"),"requestId":request_id()}), &["project","prompt","requestId"]) },
        Tool { name: "sessions_send", requires: Requirement::standard(&[GRANT::Write(DOMAIN::Sessions)]), mutation: true, description: "Send a follow-up to an idle session. A busy session returns an error and nothing is sent.", schema: object(json!({"sessionId":{"type":["string","integer"]},"prompt":string("The follow-up"),"requestId":request_id()}), &["sessionId","prompt","requestId"]) },
        Tool { name: "sessions_stop", requires: Requirement::standard(&[GRANT::SessionsStop]), mutation: true, description: "Stop a session's running turn. History is kept.", schema: object(json!({"sessionId":{"type":["string","integer"]},"requestId":request_id()}), &["sessionId","requestId"]) },
        Tool { name: "board_list", requires: Requirement::standard(&[GRANT::Read(DOMAIN::Board)]), mutation: false, description: "List Board cards in granted projects.", schema: object(json!({"project":string("Optional project path"),"archived":{"type":"boolean"},"limit":integer("1-100, default 30"),"offset":integer("nextOffset from a previous page")}), &[]) },
        Tool { name: "board_read", requires: Requirement::standard(&[GRANT::Read(DOMAIN::Board)]), mutation: false, description: "Read a Board card: stage state, runs, artifact versions, questions and optionally one artifact page.", schema: object(json!({"cardId":string("Card ID"),"artifactKind":string("task, spec, plan, questions, answers, impl_report, ..."),"artifactVersion":integer("Defaults to the latest"),"maxChars":integer("1-6000"),"charOffset":integer("nextCharOffset from a previous page")}), &["cardId"]) },
        Tool { name: "board_create", requires: Requirement::standard(&[GRANT::BoardCreate]), mutation: true, description: "Create one idle Backlog card. No stage or agent starts.", schema: object(json!({"project":string("Project path from projects_list"),"title":string("Title"),"description":string("Description"),"acceptanceCriteria":string("Optional criteria"),"baseRef":string("Optional base branch"),"requestId":request_id()}), &["project","title","description","requestId"]) },
        Tool { name: "board_update", requires: Requirement::standard(&[GRANT::Write(DOMAIN::Board)]), mutation: true, description: "Edit title, description or acceptance criteria on an idle Backlog card.", schema: object(json!({"cardId":string("Card ID"),"title":string("Title"),"description":string("Description"),"acceptanceCriteria":string("Acceptance criteria"),"requestId":request_id()}), &["cardId","requestId"]) },
        board_archive_tool("board_archive", "Archive an idle, unqueued Board card."),
        board_archive_tool("board_unarchive", "Restore an idle, unqueued Board card."),

    ]
}

fn board_archive_tool(name: &'static str, description: &'static str) -> Tool {
    Tool {
        name,
        requires: Requirement::standard(&[GRANT::Write(DOMAIN::Board)]),
        mutation: true,
        description,
        schema: object(
            json!({"cardId":string("Card ID"),"requestId":request_id()}),
            &["cardId", "requestId"],
        ),
    }
}

pub fn catalog() -> &'static [Tool] {
    static CATALOG: std::sync::OnceLock<Vec<Tool>> = std::sync::OnceLock::new();
    CATALOG.get_or_init(build_catalog)
}

pub fn visible(principal: &Principal) -> Vec<&'static Tool> {
    catalog()
        .iter()
        .filter(|tool| principal.allows(&tool.requires))
        .collect()
}

/// Strictly validates tool arguments before any authorization-dependent work.
pub fn validate(name: &str, arguments: &Value) -> Result<&'static Tool, String> {
    let tool = catalog()
        .iter()
        .find(|tool| tool.name == name)
        .ok_or("Unknown MOLFAR tool.")?;
    match name {
        "projects_list" => check::<Empty>(arguments),
        "sessions_list" => check::<SessionsList>(arguments),
        "sessions_read" => check::<SessionsRead>(arguments),
        "sessions_start" => check::<SessionsStart>(arguments),
        "sessions_send" => check::<SessionsSend>(arguments),
        "sessions_stop" => check::<SessionsStop>(arguments),
        board => {
            let internal = board.replacen('_', ".", 1);
            if tool.mutation {
                crate::app_access::board::normalize_request_id(
                    arguments["requestId"].as_str(),
                    None,
                )?;
            }
            crate::app_access::board::validate(&internal, arguments)
        }
    }?;
    Ok(tool)
}

pub fn parse<T: DeserializeOwned>(arguments: &Value) -> Result<T, String> {
    serde_json::from_value(arguments.clone()).map_err(|error| format!("Invalid arguments: {error}"))
}

fn check<T: DeserializeOwned>(arguments: &Value) -> Result<(), String> {
    if !arguments.is_object() {
        return Err("Tool arguments must be a JSON object.".into());
    }
    parse::<T>(arguments).map(drop)
}

#[cfg(test)]
mod tests {
    use super::{validate, DOMAIN, GRANT};
    use serde_json::json;

    #[test]
    fn arguments_are_strict_and_tools_carry_their_scope() {
        assert_eq!(
            validate("projects_list", &json!({})).unwrap().requires.any,
            [GRANT::Read(DOMAIN::Board), GRANT::Read(DOMAIN::Sessions)]
        );
        assert_eq!(
            validate("sessions_stop", &json!({"sessionId":1,"requestId":"r"}))
                .unwrap()
                .requires
                .any,
            [GRANT::SessionsStop]
        );
        for (name, arguments) in [
            ("projects_list", json!({"extra":1})),
            ("sessions_start", json!({"project":"/p","prompt":"x"})),
            (
                "sessions_send",
                json!({"sessionId":1,"prompt":"x","requestId":"r","model":"m"}),
            ),
            (
                "board_create",
                json!({"project":"/p","title":"t","description":"d"}),
            ),
            ("board_list", json!({"stage":"grill"})),
            ("board_queue", json!({})),
            ("sessions_list", json!([])),
        ] {
            assert!(validate(name, &arguments).is_err(), "{name}");
        }
    }
}
