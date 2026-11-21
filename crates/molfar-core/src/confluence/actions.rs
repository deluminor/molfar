use std::collections::HashSet;

use serde::Deserialize;
use serde_json::{json, Value};

use super::{
    config,
    connector::{Connector, Kind},
    search::Scope,
};
use crate::{secrets::SecretStore, store::Store};

pub const SEARCH: &str = "confluence.search";
pub const READ: &str = "confluence.read";
pub const TREE: &str = "confluence.tree";
pub const READ_ACTIONS: [&str; 3] = [SEARCH, READ, TREE];

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Search {
    query: String,
    space_key: Option<String>,
    limit: Option<usize>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Read {
    id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Tree {
    space_key: String,
    space_id: String,
    parent_id: Option<String>,
    parent_kind: Option<Kind>,
}

pub fn validate(action: &str, input: &Value) -> Result<(), String> {
    let result = match action {
        SEARCH => serde_json::from_value::<Search>(input.clone()).map(|_| ()),
        READ => serde_json::from_value::<Read>(input.clone()).map(|_| ()),
        TREE => serde_json::from_value::<Tree>(input.clone()).map(|_| ()),
        _ => return Err("Unknown Confluence action.".into()),
    };

    result.map_err(|error| error.to_string())
}

pub struct ReadActions {
    connector: Connector,
    hidden: HashSet<String>,
}

impl ReadActions {
    pub fn open(db: &Store, secrets: &SecretStore) -> Result<Self, String> {
        config::migrate(db, secrets)?;
        Ok(Self {
            connector: Connector::open(db, secrets)?,
            hidden: config::hidden_spaces(db)?,
        })
    }

    pub fn execute(&self, action: &str, input: &Value) -> Result<Value, String> {
        let connector = &self.connector;
        let hidden = &self.hidden;
        let error = |error: super::error::ConfluenceError| error.to_string();
        match action {
            SEARCH => {
                let input: Search =
                    serde_json::from_value(input.clone()).map_err(|err| err.to_string())?;
                let nodes = connector
                    .search(
                        &input.query,
                        input.space_key.as_deref(),
                        hidden,
                        input.limit.unwrap_or(25),
                        Scope::Text,
                    )
                    .map_err(error)?;
                Ok(json!({ "nodes": nodes }))
            }
            READ => {
                let input: Read =
                    serde_json::from_value(input.clone()).map_err(|err| err.to_string())?;
                let page = connector.page(&input.id, false).map_err(error)?;
                let (markdown, truncated) = page.markdown();
                Ok(
                    json!({ "id": page.id, "title": page.title, "url": page.url, "markdown": markdown, "truncated": truncated }),
                )
            }
            TREE => {
                let input: Tree =
                    serde_json::from_value(input.clone()).map_err(|err| err.to_string())?;
                let space = connector
                    .visible_spaces(hidden, false)
                    .map_err(error)?
                    .into_iter()
                    .find(|space| space.id == input.space_id && space.key == input.space_key)
                    .ok_or_else(|| super::error::ConfluenceError::NotFound.to_string())?;
                let parent = input
                    .parent_id
                    .as_deref()
                    .map(|id| (id, input.parent_kind.unwrap_or_default()));
                let children = connector
                    .children(&space, parent, None, false)
                    .map_err(error)?;
                Ok(json!({ "nodes": children.nodes }))
            }
            _ => Err("Unknown Confluence action.".into()),
        }
    }
}
