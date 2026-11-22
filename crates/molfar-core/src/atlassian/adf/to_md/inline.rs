use serde_json::Value;

pub(super) fn render_media(node: &Value) -> String {
    if super::kind(node) != "media" && super::kind(node) != "mediaInline" {
        return super::render_blocks(super::content(node));
    }
    let id = super::attr_str(node, "id");
    let alt = super::attr_str(node, "alt");
    if id.is_empty() {
        return alt.to_string();
    }
    format!("![{alt}](attachment://{id})")
}

fn render_date(node: &Value) -> String {
    let raw = match super::attr(node, "timestamp") {
        Some(Value::String(value)) => value.clone(),
        Some(Value::Number(value)) => value.to_string(),
        _ => String::new(),
    };
    raw.parse::<i64>()
        .ok()
        .and_then(chrono::DateTime::from_timestamp_millis)
        .map(|time| time.format("%Y-%m-%d").to_string())
        .filter(|formatted| !formatted.is_empty())
        .unwrap_or(raw)
}

pub(super) fn inline(nodes: &[Value]) -> String {
    let mut out = String::new();
    for node in nodes {
        match super::kind(node) {
            "text" => out.push_str(&marked(node)),
            "hardBreak" => out.push('\n'),
            "mention" => {
                let text = super::attr_str(node, "text");
                if text.starts_with('@') {
                    out.push_str(text);
                } else if !text.is_empty() {
                    out.push('@');
                    out.push_str(text);
                } else {
                    out.push_str(&inline(super::content(node)));
                }
            }
            "emoji" => {
                let text = super::attr_str(node, "text");
                out.push_str(if text.is_empty() {
                    super::attr_str(node, "shortName")
                } else {
                    text
                });
            }
            "inlineCard" | "blockCard" | "embedCard" => {
                let url = super::attr_str(node, "url");
                if url.is_empty() {
                    out.push_str(&inline(super::content(node)));
                } else {
                    out.push('<');
                    out.push_str(url);
                    out.push('>');
                }
            }
            "status" => {
                let text = super::attr_str(node, "text");
                if !text.is_empty() {
                    out.push('`');
                    out.push_str(text);
                    out.push('`');
                }
            }
            "date" => out.push_str(&render_date(node)),
            "media" | "mediaInline" => out.push_str(&render_media(node)),
            _ => {
                if let Some(text) = node.get("text").and_then(Value::as_str) {
                    out.push_str(text);
                }
                out.push_str(&inline(super::content(node)));
            }
        }
    }
    out
}

fn marked(node: &Value) -> String {
    let text = node.get("text").and_then(Value::as_str).unwrap_or_default();
    if text.is_empty() {
        return String::new();
    }
    let marks = node
        .get("marks")
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or_default();
    if marks.iter().any(|mark| super::kind(mark) == "code") {
        return format!("`{text}`");
    }
    let mut text = text.to_string();
    for mark in marks {
        text = match super::kind(mark) {
            "strong" => format!("**{text}**"),
            "em" => format!("_{text}_"),
            "strike" => format!("~~{text}~~"),
            "link" => {
                let href = super::attr_str(mark, "href");
                if href.is_empty() {
                    text
                } else {
                    format!("[{text}]({href})")
                }
            }
            _ => text,
        };
    }
    text
}
