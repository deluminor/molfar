use serde_json::{json, Value};

use super::{
    object,
    schema::{integer, string},
    TargetKind, Tool,
};
use crate::{
    confluence::actions,
    external_mcp::grants::types::{ACCESS, DOMAIN},
};

pub const SEARCH: &str = "confluence_search";
pub const READ: &str = "confluence_read";
pub const TREE: &str = "confluence_tree";

pub fn action(name: &str) -> Result<&'static str, String> {
    match name {
        SEARCH => Ok(actions::SEARCH),
        READ => Ok(actions::READ),
        TREE => Ok(actions::TREE),
        _ => Err("Unknown Confluence tool.".into()),
    }
}

pub fn validate(name: &str, arguments: &Value) -> Result<(), String> {
    actions::validate(action(name)?, arguments)
}

pub(super) fn definitions() -> Vec<Tool> {
    [
        (
            SEARCH,
            "Search page titles and text across visible Confluence spaces.",
            object(
                json!({
                    "query": string("Search term, up to 200 characters"),
                    "spaceKey": string("Optional Confluence space key"),
                    "limit": integer("Result limit, up to 50")
                }),
                &["query"],
            ),
        ),
        (
            READ,
            "Read a Confluence page as Markdown.",
            object(
                json!({
                    "id": string("Confluence page ID")
                }),
                &["id"],
            ),
        ),
        (
            TREE,
            "List direct children in a Confluence space or folder.",
            object(
                json!({
                    "spaceKey": string("Confluence space key"),
                    "spaceId": string("Confluence space ID"),
                    "parentId": string("Optional parent content ID"),
                    "parentKind": {"type":"string","enum":["page","folder"]}
                }),
                &["spaceKey", "spaceId"],
            ),
        ),
    ]
    .into_iter()
    .map(|(name, description, schema)| {
        Tool::domain(
            name,
            description,
            DOMAIN::Confluence,
            TargetKind::None,
            false,
            ACCESS::Standard,
            schema,
        )
    })
    .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        app_access::validate_operator,
        external_mcp::{grants::types::GRANT, tools, types::Principal},
    };

    #[test]
    fn confluence_tools_require_an_explicit_read_grant_and_operator_contract_is_closed() {
        let grants: Vec<GRANT> = serde_json::from_value(json!(["notes:read"])).unwrap();
        let mut principal = Principal {
            client_id: "fixture".into(),
            name: "Fixture".into(),
            grants,
            resources: Vec::new(),
            projects: Vec::new(),
        };
        assert!(serde_json::from_value::<GRANT>(json!("confluence:write")).is_err());
        for (tool, fields) in [
            (SEARCH, json!({"query": "Guide", "limit": 5})),
            (READ, json!({"id": "12"})),
            (
                TREE,
                json!({"spaceKey": "TEAM", "spaceId": "1", "parentKind": "folder", "parentId": "42"}),
            ),
        ] {
            let internal = action(tool).unwrap();
            let definition = tools::validate(tool, &fields).unwrap();
            assert_eq!(definition.target, TargetKind::None);
            assert!(!definition.mutation);
            assert!(!principal.allows(&definition.requires));
            assert!(tools::visible(&principal)
                .iter()
                .all(|candidate| candidate.name != tool));
            assert!(validate_operator(internal, &fields).is_ok());
            let mut invalid = fields;
            invalid["unknown"] = json!(true);
            assert!(validate_operator(internal, &invalid).is_err());
        }

        principal.grants = vec![GRANT::Read(DOMAIN::Confluence)];
        let names = tools::visible(&principal)
            .into_iter()
            .map(|tool| tool.name)
            .collect::<Vec<_>>();
        assert_eq!(names, [SEARCH, READ, TREE]);
    }
}
