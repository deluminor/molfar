use std::collections::HashSet;

use super::{
    connector::{api_path, field, valid_id, webui, Connector, Kind, Node},
    error::ConfluenceError,
    http::Transport,
};

#[derive(Clone, Copy)]
pub enum Scope {
    Text,
    Title,
}

impl<T: Transport> Connector<T> {
    pub fn search(
        &self,
        query: &str,
        space: Option<&str>,
        hidden: &HashSet<String>,
        limit: usize,
        scope: Scope,
    ) -> Result<Vec<Node>, ConfluenceError> {
        let query = query.trim();
        if (query.is_empty() && matches!(scope, Scope::Text))
            || query.chars().count() > 200
            || query.chars().any(char::is_control)
        {
            return Ok(Vec::new());
        }

        let spaces = self.visible_spaces(hidden, false)?;
        let keys: Vec<_> = spaces
            .iter()
            .filter(|item| space.is_none_or(|key| item.key == key))
            .map(|item| item.key.as_str())
            .collect();
        if keys.is_empty() {
            return Ok(Vec::new());
        }

        let limit = limit.clamp(1, 50);
        let mut nodes = Vec::new();
        for keys in keys.chunks(40) {
            let keys = keys
                .iter()
                .map(|key| quote(key))
                .collect::<Vec<_>>()
                .join(",");
            let field_name = match scope {
                Scope::Text => "text",
                Scope::Title => "title",
            };
            let cql = if query.is_empty() {
                format!("type = page AND space IN ({keys}) ORDER BY lastmodified DESC")
            } else {
                format!(
                    "type = page AND space IN ({keys}) AND {field_name} ~ {}",
                    quote(&phrase(query))
                )
            };
            let (items, _) = self.collection(&api_path(
                "/wiki/rest/api/content/search",
                &[
                    ("cql", &cql),
                    ("expand", "space"),
                    ("limit", &limit.to_string()),
                ],
            ))?;
            nodes.extend(items.into_iter().filter_map(|result| {
                let row = result.get("content").unwrap_or(&result);
                let id = field(row, "id");
                let key = row
                    .pointer("/space/key")
                    .and_then(serde_json::Value::as_str)?;
                if !spaces.iter().any(|space| space.key == key) || !valid_id(&id) {
                    return None;
                }
                Some(Node {
                    url: self.url(webui(row), &format!("/wiki/spaces/{key}/pages/{id}")),
                    id,
                    title: field(row, "title"),
                    kind: Kind::Page,
                    space_key: key.to_owned(),
                })
            }));
            if nodes.len() >= limit {
                break;
            }
        }

        nodes.truncate(limit);
        Ok(nodes)
    }
}

fn quote(text: &str) -> String {
    format!("\"{}\"", text.replace('\\', "\\\\").replace('"', "\\\""))
}

fn phrase(query: &str) -> String {
    let escaped = query.replace('\\', "\\\\").replace('"', "\\\"");
    format!("\"{escaped}\"")
}
