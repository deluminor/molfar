use super::constants::DEFAULT_LIMIT;
use super::http::confluence_get;
use super::parse::{
    encode, next_cursor, normalize_kind, parse_v2_node, parse_v2_pages, results_array,
    string_field, valid_id,
};
use super::types::{AtlassianConfig, ConfluenceNode};

pub(super) fn list_space_roots(
    config: &AtlassianConfig,
    space_id: &str,
    space_key: &str,
) -> Result<Vec<ConfluenceNode>, String> {
    // Prefer the space homepage's content tree — matches Confluence sidebar.
    if let Ok(Some(homepage_id)) = space_homepage_id(config, space_id) {
        if let Ok(children) =
            list_content_direct_children(config, "pages", &homepage_id, space_id, space_key)
        {
            if !children.is_empty() {
                return Ok(children);
            }
        }
    }
    list_space_root_fallback(config, space_id, space_key)
}

pub(super) fn space_homepage_id(
    config: &AtlassianConfig,
    space_id: &str,
) -> Result<Option<String>, String> {
    let data = confluence_get(config, &format!("/wiki/api/v2/spaces/{space_id}"))?;
    Ok(string_field(&data, "homepageId").filter(|id| valid_id(id)))
}

pub(super) fn list_space_root_fallback(
    config: &AtlassianConfig,
    space_id: &str,
    space_key: &str,
) -> Result<Vec<ConfluenceNode>, String> {
    let mut nodes = Vec::new();
    let mut cursor: Option<String> = None;
    loop {
        let mut path =
            format!("/wiki/api/v2/spaces/{space_id}/pages?limit={DEFAULT_LIMIT}&depth=root");
        if let Some(token) = cursor.as_ref() {
            path.push_str("&cursor=");
            path.push_str(&encode(token));
        }
        let data = confluence_get(config, &path)?;
        nodes.extend(parse_v2_pages(&data, space_id, space_key, "", &config.site));
        cursor = next_cursor(&data);
        if cursor.is_none() || nodes.len() >= 400 {
            break;
        }
    }
    if let Ok(folders) = list_space_folders(config, space_id, space_key) {
        for folder in folders {
            if !nodes.iter().any(|node| node.id == folder.id) {
                nodes.push(folder);
            }
        }
    }
    nodes.sort_by_key(|node| node.title.to_lowercase());
    Ok(nodes)
}

pub(super) fn list_space_folders(
    config: &AtlassianConfig,
    space_id: &str,
    space_key: &str,
) -> Result<Vec<ConfluenceNode>, String> {
    let mut nodes = Vec::new();
    let mut cursor: Option<String> = None;
    loop {
        let mut path = format!("/wiki/api/v2/folders?limit={DEFAULT_LIMIT}&space-id={space_id}");
        if let Some(token) = cursor.as_ref() {
            path.push_str("&cursor=");
            path.push_str(&encode(token));
        }
        let data = match confluence_get(config, &path) {
            Ok(data) => data,
            Err(_) => break,
        };
        for item in results_array(&data) {
            if let Some(node) = parse_v2_node(item, space_id, space_key, "", &config.site) {
                if node.parent_id.is_empty() {
                    nodes.push(node);
                }
            }
        }
        cursor = next_cursor(&data);
        if cursor.is_none() {
            break;
        }
    }
    Ok(nodes)
}

pub(super) fn list_node_children(
    config: &AtlassianConfig,
    parent_id: &str,
    parent_kind: &str,
    space_id: &str,
    space_key: &str,
) -> Result<Vec<ConfluenceNode>, String> {
    let kind = normalize_kind(parent_kind);
    let primary = match kind.as_str() {
        "folder" => "folders",
        _ => "pages",
    };
    let secondary = if primary == "pages" {
        "folders"
    } else {
        "pages"
    };
    match list_content_direct_children(config, primary, parent_id, space_id, space_key) {
        Ok(nodes) => Ok(nodes),
        Err(error) => {
            match list_content_direct_children(config, secondary, parent_id, space_id, space_key) {
                Ok(nodes) => Ok(nodes),
                Err(_) => Err(error),
            }
        }
    }
}

pub(super) fn list_content_direct_children(
    config: &AtlassianConfig,
    kind_path: &str,
    parent_id: &str,
    space_id: &str,
    space_key: &str,
) -> Result<Vec<ConfluenceNode>, String> {
    let mut nodes = Vec::new();
    let mut cursor: Option<String> = None;
    loop {
        let mut path =
            format!("/wiki/api/v2/{kind_path}/{parent_id}/direct-children?limit={DEFAULT_LIMIT}");
        if let Some(token) = cursor.as_ref() {
            path.push_str("&cursor=");
            path.push_str(&encode(token));
        }
        let data = confluence_get(config, &path)?;
        nodes.extend(parse_v2_pages(
            &data,
            space_id,
            space_key,
            parent_id,
            &config.site,
        ));
        cursor = next_cursor(&data);
        if cursor.is_none() || nodes.len() >= 400 {
            break;
        }
    }
    nodes.sort_by_key(|node| node.title.to_lowercase());
    Ok(nodes)
}
