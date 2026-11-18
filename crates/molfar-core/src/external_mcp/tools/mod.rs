pub mod automations;
mod board;
pub mod familiars;
pub mod inbox;
pub mod knowledge;
mod schema;
pub mod sessions;

use super::{
    grants::types::{Requirement, ACCESS, DOMAIN, GRANT},
    types::Principal,
};
use schema::object;
use serde::{de::DeserializeOwned, Deserialize};
use serde_json::{json, Value};
use sessions::*;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum TargetKind {
    Project,
    Vault,
    InboxProvider,
    Familiar,
    None,
}

pub struct Tool {
    pub name: &'static str,
    pub requires: Requirement,
    pub mutation: bool,
    pub target: TargetKind,
    pub resumable: bool,
    pub description: &'static str,
    pub schema: Value,
}

impl Tool {
    fn domain(
        name: &'static str,
        description: &'static str,
        domain: DOMAIN,
        target: TargetKind,
        mutation: bool,
        access: ACCESS,
        schema: Value,
    ) -> Self {
        Self {
            name,
            requires: Requirement {
                any: domain_grant(domain, mutation),
                access,
            },
            mutation,
            target,
            resumable: true,
            description,
            schema,
        }
    }
}

fn domain_grant(domain: DOMAIN, mutation: bool) -> &'static [GRANT] {
    match (domain, mutation) {
        (DOMAIN::Automations, false) => &[GRANT::Read(DOMAIN::Automations)],
        (DOMAIN::Automations, true) => &[GRANT::Write(DOMAIN::Automations)],
        (DOMAIN::Familiars, false) => &[GRANT::Read(DOMAIN::Familiars)],
        (DOMAIN::Familiars, true) => &[GRANT::Write(DOMAIN::Familiars)],
        (DOMAIN::Inbox, false) => &[GRANT::Read(DOMAIN::Inbox)],
        (DOMAIN::Inbox, true) => &[GRANT::Write(DOMAIN::Inbox)],
        (DOMAIN::Knowledge, false) => &[GRANT::Read(DOMAIN::Knowledge)],
        (DOMAIN::Knowledge, true) => &[GRANT::Write(DOMAIN::Knowledge)],
        _ => unreachable!("Only registered external domains have tool definitions"),
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Empty {}

fn build_catalog() -> Vec<Tool> {
    let mut tools = vec![Tool {
        name: "projects_list",
        requires: Requirement::standard(&[
            GRANT::Read(DOMAIN::Board),
            GRANT::Read(DOMAIN::Sessions),
        ]),
        mutation: false,
        target: TargetKind::Project,
        resumable: true,
        description: "List the MOLFAR projects this client may use.",
        schema: object(json!({}), &[]),
    }];
    tools.extend(sessions::definitions());
    tools.extend(board::definitions());
    tools.extend(knowledge::definitions());
    tools.extend(automations::definitions());
    tools.extend(familiars::definitions());
    tools.extend(inbox::definitions());
    tools
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
    if !arguments.is_object() {
        return Err("Tool arguments must be a JSON object.".into());
    }
    if tool.mutation {
        crate::app_access::board::normalize_request_id(arguments["requestId"].as_str(), None)?;
    }
    match name {
        "projects_list" => check::<Empty>(arguments),
        "sessions_list" => check::<SessionsList>(arguments),
        "sessions_read" => check::<SessionsRead>(arguments),
        "sessions_start" => check::<SessionsStart>(arguments),
        "sessions_send" => check::<SessionsSend>(arguments),
        "sessions_stop" => check::<SessionsStop>(arguments),
        name if name.starts_with("knowledge_") => knowledge::validate(name, arguments),
        name if name.starts_with("automations_") => automations::validate(name, arguments),
        name if name.starts_with("familiars_") => familiars::validate(name, arguments),
        name if name.starts_with("inbox_") => inbox::validate(name, arguments),
        board => {
            let internal = board.replacen('_', ".", 1);
            crate::app_access::board::validate(&internal, arguments)
        }
    }?;
    Ok(tool)
}

pub fn parse<T: DeserializeOwned>(arguments: &Value) -> Result<T, String> {
    serde_json::from_value(arguments.clone()).map_err(|error| format!("Invalid arguments: {error}"))
}

fn check<T: DeserializeOwned>(arguments: &Value) -> Result<(), String> {
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
