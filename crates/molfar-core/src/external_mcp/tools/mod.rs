mod board;
mod schema;
pub mod sessions;

use super::{
    grants::types::{Requirement, DOMAIN, GRANT},
    types::Principal,
};
use schema::object;
use serde::{de::DeserializeOwned, Deserialize};
use serde_json::{json, Value};
use sessions::*;

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

fn build_catalog() -> Vec<Tool> {
    let mut tools = vec![Tool {
        name: "projects_list",
        requires: Requirement::standard(&[
            GRANT::Read(DOMAIN::Board),
            GRANT::Read(DOMAIN::Sessions),
        ]),
        mutation: false,
        description: "List the MOLFAR projects this client may use.",
        schema: object(json!({}), &[]),
    }];
    tools.extend(sessions::definitions());
    tools.extend(board::definitions());
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
