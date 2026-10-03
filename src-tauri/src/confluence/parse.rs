use serde_json::Value;
use url::form_urlencoded;

use super::types::{ConfluenceNode, ConfluenceSpace};

pub(super) fn parse_spaces(data: &Value) -> Vec<ConfluenceSpace> {
    results_array(data)
        .iter()
        .filter_map(|item| {
            let id = string_field(item, "id")?;
            let key = string_field(item, "key")?;
            let name = string_field(item, "name").unwrap_or_else(|| key.clone());
            Some(ConfluenceSpace { id, key, name })
        })
        .collect()
}

pub(super) fn parse_v2_pages(
    data: &Value,
    space_id: &str,
    space_key: &str,
    parent_id: &str,
    site: &str,
) -> Vec<ConfluenceNode> {
    results_array(data)
        .iter()
        .filter_map(|item| parse_v2_node(item, space_id, space_key, parent_id, site))
        .collect()
}

pub(super) fn parse_v2_node(
    item: &Value,
    space_id: &str,
    space_key: &str,
    parent_id: &str,
    site: &str,
) -> Option<ConfluenceNode> {
    let (kind, source) = if let Some(page) = item.get("page") {
        ("page".to_string(), page)
    } else if let Some(folder) = item.get("folder") {
        ("folder".to_string(), folder)
    } else if let Some(board) = item.get("whiteboard") {
        ("whiteboard".to_string(), board)
    } else {
        let type_hint = item
            .get("type")
            .and_then(Value::as_str)
            .or_else(|| item.get("status").and_then(Value::as_str))
            .unwrap_or("page");
        (normalize_kind(type_hint), item)
    };

    let id = string_field(source, "id")?;
    let title = string_field(source, "title").unwrap_or_else(|| "Untitled".into());
    let resolved_space = source
        .get("spaceId")
        .and_then(Value::as_str)
        .unwrap_or(space_id)
        .to_string();
    let resolved_parent = source
        .get("parentId")
        .and_then(Value::as_str)
        .unwrap_or(parent_id)
        .to_string();
    let webui = source
        .pointer("/_links/webui")
        .and_then(Value::as_str)
        .unwrap_or_default();

    let url = if webui.is_empty() {
        content_url(site, &kind, &id)
    } else if webui.starts_with("http") {
        webui.to_string()
    } else {
        format!("{site}/wiki{webui}")
    };

    // `childPosition` is sibling order, not a child count — never use it here.
    let has_children = source
        .get("hasChildren")
        .and_then(Value::as_bool)
        .unwrap_or({
            matches!(
                kind.as_str(),
                "folder" | "page" | "blogpost" | "whiteboard" | "database"
            )
        });
    let readable = kind == "page" || kind == "blogpost";

    Some(ConfluenceNode {
        id,
        title,
        kind,
        space_id: resolved_space,
        space_key: space_key.to_string(),
        parent_id: resolved_parent,
        url,
        has_children,
        readable,
    })
}

pub(super) fn normalize_kind(raw: &str) -> String {
    match raw.trim().to_ascii_lowercase().as_str() {
        "page" => "page".into(),
        "folder" => "folder".into(),
        "whiteboard" => "whiteboard".into(),
        "database" => "database".into(),
        "embed" | "smart-link" | "smartlink" => "embed".into(),
        "blogpost" | "blog" => "blogpost".into(),
        "current" => "page".into(), // v2 status field misuse guard
        "" => "other".into(),
        _ => "other".into(),
    }
}

pub(super) fn content_url(site: &str, kind: &str, id: &str) -> String {
    let site = site.trim_end_matches('/');
    match kind {
        "folder" => format!("{site}/wiki/folder/{id}"),
        "whiteboard" => format!("{site}/wiki/whiteboard/{id}"),
        _ => format!("{site}/wiki/pages/viewpage.action?pageId={id}"),
    }
}

pub(super) fn results_array(data: &Value) -> &[Value] {
    data.get("results")
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or_default()
}

pub(super) fn next_cursor(data: &Value) -> Option<String> {
    data.pointer("/_links/next")
        .and_then(Value::as_str)
        .and_then(|link| {
            url::Url::parse(&format!("https://placeholder.local{link}"))
                .ok()
                .and_then(|url| {
                    url.query_pairs()
                        .find(|(key, _)| key == "cursor")
                        .map(|(_, value)| value.to_string())
                })
                .or_else(|| {
                    // Relative query-only next link
                    link.split("cursor=")
                        .nth(1)
                        .map(|rest| rest.split('&').next().unwrap_or(rest).to_string())
                })
        })
}

pub(super) fn string_field(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(|field| {
            field
                .as_str()
                .map(str::to_string)
                .or_else(|| field.as_i64().map(|n| n.to_string()))
                .or_else(|| field.as_u64().map(|n| n.to_string()))
        })
        .map(|text| text.trim().to_string())
        .filter(|text| !text.is_empty())
}

pub(super) fn valid_id(value: &str) -> bool {
    let trimmed = value.trim();
    !trimmed.is_empty()
        && trimmed.len() <= 64
        && trimmed
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_')
}

pub(super) fn encode(value: &str) -> String {
    form_urlencoded::byte_serialize(value.as_bytes()).collect()
}
