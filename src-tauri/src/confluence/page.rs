use serde_json::Value;

use crate::atlassian_adf::rich_text;

use super::constants::BODY_CHAR_CAP;
use super::http::confluence_get;
use super::parse::{content_url, normalize_kind, string_field};
use super::types::{AtlassianConfig, ConfluencePage};

pub(super) fn fetch_non_page(config: &AtlassianConfig, id: &str) -> Result<ConfluencePage, String> {
    if let Ok(data) = confluence_get(config, &format!("/wiki/api/v2/folders/{id}")) {
        return Ok(unsupported_page(&data, "folder", &config.site));
    }

    if let Ok(data) = confluence_get(config, &format!("/wiki/api/v2/whiteboards/{id}")) {
        return Ok(unsupported_page(&data, "whiteboard", &config.site));
    }

    let data = confluence_get(
        config,
        &format!("/wiki/rest/api/content/{id}?expand=space,ancestors"),
    )?;
    let kind = normalize_kind(string_field(&data, "type").as_deref().unwrap_or("other"));
    Ok(unsupported_from_v1(&data, &kind, &config.site))
}

pub(super) fn unsupported_page(data: &Value, kind: &str, site: &str) -> ConfluencePage {
    let id = string_field(data, "id").unwrap_or_default();
    let title = string_field(data, "title").unwrap_or_else(|| "Untitled".into());
    let space_id = data
        .pointer("/spaceId")
        .and_then(Value::as_str)
        .or_else(|| data.pointer("/space/id").and_then(Value::as_str))
        .unwrap_or_default()
        .to_string();
    ConfluencePage {
        id: id.clone(),
        title: title.clone(),
        kind: kind.into(),
        space_id,
        space_key: String::new(),
        parent_id: String::new(),
        url: content_url(site, kind, &id),
        body: format!(
            "_This Confluence {kind} cannot be read as markdown in MOLFAR. Open it in Confluence instead._\n\n[{title}]({})",
            content_url(site, kind, &id)
        ),
        readable: false,
        truncated: false,
    }
}

pub(super) fn unsupported_from_v1(data: &Value, kind: &str, site: &str) -> ConfluencePage {
    let id = string_field(data, "id").unwrap_or_default();
    let title = string_field(data, "title").unwrap_or_else(|| "Untitled".into());
    let space_key = data
        .pointer("/space/key")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let space_id = data
        .pointer("/space/id")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let webui = data
        .pointer("/_links/webui")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let url = if webui.is_empty() {
        content_url(site, kind, &id)
    } else {
        format!("{site}/wiki{webui}")
    };
    ConfluencePage {
        id,
        title: title.clone(),
        kind: kind.into(),
        space_id,
        space_key,
        parent_id: String::new(),
        url: url.clone(),
        body: format!(
            "_This Confluence {kind} cannot be read as markdown in MOLFAR. Open it in Confluence instead._\n\n[{title}]({url})"
        ),
        readable: false,
        truncated: false,
    }
}

pub(super) fn parse_page(data: &Value, site: &str) -> Result<ConfluencePage, String> {
    let id =
        string_field(data, "id").ok_or_else(|| "Confluence page is missing an id".to_string())?;
    let title = string_field(data, "title").unwrap_or_else(|| "Untitled".into());
    let kind = normalize_kind(
        data.get("type")
            .and_then(Value::as_str)
            .or_else(|| data.get("status").and_then(Value::as_str))
            .unwrap_or("page"),
    );
    // v2 pages are always pages when returned from /pages/{id}
    let kind = if kind == "other" { "page".into() } else { kind };

    let space_id = data
        .get("spaceId")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let parent_id = data
        .get("parentId")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let webui = data
        .pointer("/_links/webui")
        .and_then(Value::as_str)
        .unwrap_or_default();

    let url = if webui.is_empty() {
        content_url(site, "page", &id)
    } else if webui.starts_with("http") {
        webui.to_string()
    } else {
        format!("{site}/wiki{webui}")
    };

    let adf_value = data.pointer("/body/atlas_doc_format/value");
    let (mut body, truncated) = match adf_value {
        Some(Value::String(raw)) => {
            let parsed: Value = serde_json::from_str(raw).unwrap_or(Value::Null);
            let markdown = rich_text(Some(&parsed));
            truncate_body(markdown)
        }
        Some(doc @ Value::Object(_)) => truncate_body(rich_text(Some(doc))),
        _ => (String::new(), false),
    };

    if body.trim().is_empty() {
        body = format!("_Empty page._\n\n[{title}]({url})");
    }

    Ok(ConfluencePage {
        id,
        title,
        kind,
        space_id,
        space_key: String::new(),
        parent_id,
        url,
        body,
        readable: true,
        truncated,
    })
}

pub(super) fn truncate_body(body: String) -> (String, bool) {
    if body.len() <= BODY_CHAR_CAP {
        return (body, false);
    }
    let mut end = BODY_CHAR_CAP;
    while end > 0 && !body.is_char_boundary(end) {
        end -= 1;
    }
    (
        format!(
            "{}\n\n_…truncated. Use confluence.read on a smaller page or open in Confluence._",
            &body[..end]
        ),
        true,
    )
}
