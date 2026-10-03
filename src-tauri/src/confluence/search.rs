use serde_json::Value;

use super::parse::{content_url, normalize_kind, string_field};
use super::types::ConfluenceNode;

pub(super) fn parse_search_results(data: &Value, site: &str) -> Vec<ConfluenceNode> {
    let results = data
        .get("results")
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or_default();
    results
        .iter()
        .filter_map(|item| {
            let content = item.get("content").unwrap_or(item);
            let id = string_field(content, "id")?;
            let title = string_field(content, "title").unwrap_or_else(|| "Untitled".into());
            let kind = normalize_kind(string_field(content, "type").as_deref().unwrap_or("page"));
            let space_key = content
                .pointer("/space/key")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
            let space_id = content
                .pointer("/space/id")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
            let ancestors = content
                .get("ancestors")
                .and_then(Value::as_array)
                .map(Vec::as_slice)
                .unwrap_or_default();
            let parent_id = ancestors
                .last()
                .and_then(|node| string_field(node, "id"))
                .unwrap_or_default();
            let webui = content
                .pointer("/_links/webui")
                .or_else(|| item.pointer("/url"))
                .and_then(Value::as_str)
                .unwrap_or_default();
            let url = if webui.starts_with("http") {
                webui.to_string()
            } else if !webui.is_empty() {
                format!("{site}/wiki{webui}")
            } else {
                content_url(site, &kind, &id)
            };
            Some(ConfluenceNode {
                id,
                title,
                kind: kind.clone(),
                space_id,
                space_key,
                parent_id,
                url,
                has_children: kind == "folder",
                readable: kind == "page" || kind == "blogpost",
            })
        })
        .collect()
}

pub(super) fn build_search_cql(query: &str, space_key: &str) -> String {
    let escaped = escape_cql(query);
    let mut clauses = vec![
        "type in (page,folder,blogpost)".to_string(),
        format!("text ~ \"{escaped}\""),
    ];

    if !space_key.is_empty()
        && space_key
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '_')
    {
        clauses.push(format!("space = \"{space_key}\""));
    }

    format!("{} ORDER BY lastmodified DESC", clauses.join(" AND "))
}

pub(super) fn escape_cql(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}
