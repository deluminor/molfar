use super::*;

pub(crate) fn mcp_search(
    query: &str,
    space_key: Option<&str>,
    limit: Option<u32>,
) -> Result<Vec<ConfluenceNode>, String> {
    let config = require_disk_config()?;
    let query = query.trim();
    if query.is_empty() {
        return Ok(Vec::new());
    }
    if query.len() > 200 {
        return Err("Search query is too long".into());
    }
    let limit = limit.unwrap_or(SEARCH_LIMIT).clamp(1, 50);
    let space = space_key.unwrap_or("").trim();
    let cql = build_search_cql(query, space);
    let path = format!(
        "/wiki/rest/api/content/search?cql={}&limit={limit}&expand=space,ancestors",
        encode(&cql)
    );
    let data = confluence_get(&config, &path)?;
    Ok(parse_search_results(&data, &config.site))
}

pub(crate) fn mcp_list(
    space_key: Option<&str>,
    space_id: Option<&str>,
    parent_id: Option<&str>,
    parent_kind: Option<&str>,
) -> Result<serde_json::Value, String> {
    let config = require_disk_config()?;
    let parent = parent_id.unwrap_or("").trim();
    let space = space_id.unwrap_or("").trim();
    let key = space_key.unwrap_or("").trim();
    let kind = parent_kind.unwrap_or("");

    if !parent.is_empty() {
        if !valid_id(parent) {
            return Err("Invalid Confluence page id".into());
        }
        let children = list_node_children(&config, parent, kind, space, key)?;
        return Ok(serde_json::json!({
            "parentId": parent,
            "spaceId": if space.is_empty() { serde_json::Value::Null } else { space.into() },
            "parentKind": if kind.is_empty() { serde_json::Value::Null } else { kind.into() },
            "children": children,
        }));
    }

    if space.is_empty() {
        if key.is_empty() {
            return Err("Provide spaceKey, spaceId, or parentId".into());
        }
        let spaces = list_spaces_with(&config)?;
        let found = spaces
            .iter()
            .find(|entry| entry.key.eq_ignore_ascii_case(key))
            .ok_or_else(|| format!("Confluence space \"{key}\" not found"))?;
        let children = list_space_roots(&config, &found.id, &found.key)?;
        return Ok(serde_json::json!({
            "space": { "id": found.id, "key": found.key, "name": found.name },
            "children": children,
        }));
    }

    if !valid_id(space) {
        return Err("Choose a Confluence space".into());
    }
    let children = list_space_roots(&config, space, key)?;
    Ok(serde_json::json!({
        "parentId": serde_json::Value::Null,
        "spaceId": space,
        "parentKind": serde_json::Value::Null,
        "children": children,
    }))
}

pub(crate) fn mcp_read(id: &str) -> Result<serde_json::Value, String> {
    let config = require_disk_config()?;
    let page = load_page(&config, id)?;
    if page.kind == "folder" || !page.readable {
        let children = list_node_children(
            &config,
            &page.id,
            &page.kind,
            &page.space_id,
            &page.space_key,
        )?;
        return Ok(serde_json::json!({
            "id": page.id,
            "title": page.title,
            "kind": page.kind,
            "url": page.url,
            "readable": false,
            "children": children,
        }));
    }
    Ok(serde_json::json!({
        "id": page.id,
        "title": page.title,
        "kind": page.kind,
        "url": page.url,
        "readable": page.readable,
        "body": page.body,
        "spaceId": page.space_id,
        "spaceKey": page.space_key,
    }))
}
