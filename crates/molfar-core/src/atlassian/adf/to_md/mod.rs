mod inline;

use serde_json::Value;

pub fn to_markdown(doc: &Value) -> String {
    render_block(doc).trim().to_string()
}

pub(super) fn content(node: &Value) -> &[Value] {
    node.get("content")
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or_default()
}

pub(super) fn kind(node: &Value) -> &str {
    node.get("type").and_then(Value::as_str).unwrap_or_default()
}

pub(super) fn attr<'a>(node: &'a Value, name: &str) -> Option<&'a Value> {
    node.get("attrs")?.get(name)
}

pub(super) fn attr_str<'a>(node: &'a Value, name: &str) -> &'a str {
    attr(node, name).and_then(Value::as_str).unwrap_or_default()
}

pub(super) fn render_blocks(nodes: &[Value]) -> String {
    nodes
        .iter()
        .map(render_block)
        .filter(|block| !block.trim().is_empty())
        .collect::<Vec<_>>()
        .join("\n\n")
}

fn render_block(node: &Value) -> String {
    match kind(node) {
        "doc" => render_blocks(content(node)),
        "paragraph" => inline::inline(content(node)),
        "heading" => {
            let level = attr(node, "level")
                .and_then(Value::as_u64)
                .unwrap_or(1)
                .clamp(1, 6) as usize;
            format!("{} {}", "#".repeat(level), inline::inline(content(node)))
        }
        "bulletList" => render_list(node, None, false),
        "orderedList" => render_list(
            node,
            Some(attr(node, "order").and_then(Value::as_u64).unwrap_or(1)),
            false,
        ),
        "taskList" => render_list(node, None, true),
        "codeBlock" => {
            let code: String = content(node)
                .iter()
                .filter_map(|child| child.get("text").and_then(Value::as_str))
                .collect();
            format!("```{}\n{code}\n```", attr_str(node, "language"))
        }
        "blockquote" => prefixed("> ", &render_blocks(content(node))),
        "panel" => callout(
            panel_kind(attr_str(node, "panelType")),
            "",
            false,
            &render_blocks(content(node)),
        ),
        "expand" | "nestedExpand" => callout(
            "note",
            attr_str(node, "title"),
            true,
            &render_blocks(content(node)),
        ),
        "rule" => "---".into(),
        "table" => render_table(node),
        "media" | "mediaSingle" | "mediaGroup" | "mediaInline" => inline::render_media(node),
        "text" | "hardBreak" | "mention" | "emoji" | "status" | "date" | "inlineCard"
        | "blockCard" | "embedCard" => inline::inline(std::slice::from_ref(node)),
        _ => fallback(node),
    }
}

fn panel_kind(kind: &str) -> &str {
    match kind {
        "info" | "note" | "warning" | "error" | "success" => kind,
        "danger" | "failure" | "fail" => "error",
        _ => "note",
    }
}

fn callout(kind: &str, title: &str, folded: bool, body: &str) -> String {
    let fold = if folded { "-" } else { "" };
    let title = if title.is_empty() {
        String::new()
    } else {
        format!(" {title}")
    };
    let mut lines = vec![format!("> [!{kind}]{fold}{title}")];
    if !body.is_empty() {
        lines.extend(body.lines().map(|line| format!("> {line}")));
    }
    lines.join("\n")
}

fn prefixed(prefix: &str, body: &str) -> String {
    body.lines()
        .map(|line| format!("{prefix}{line}"))
        .collect::<Vec<_>>()
        .join("\n")
}

fn render_list(node: &Value, start: Option<u64>, task: bool) -> String {
    let mut lines = Vec::new();
    for (index, item) in content(node).iter().enumerate() {
        let marker = if task {
            if attr_str(item, "state").eq_ignore_ascii_case("DONE") {
                "- [x] ".to_string()
            } else {
                "- [ ] ".to_string()
            }
        } else if let Some(start) = start {
            format!("{}. ", start + index as u64)
        } else {
            "- ".to_string()
        };
        let body = {
            let blocks = render_blocks(content(item));
            if blocks.is_empty() {
                inline::inline(content(item))
            } else {
                blocks
            }
        };
        let indent = " ".repeat(marker.len());
        for (line_index, line) in body.lines().enumerate() {
            if line_index == 0 {
                lines.push(format!("{marker}{line}"));
            } else {
                lines.push(format!("{indent}{line}"));
            }
        }
        if body.is_empty() {
            lines.push(marker.trim_end().to_string());
        }
    }
    lines.join("\n")
}

fn render_table(node: &Value) -> String {
    let rows: Vec<Vec<String>> = content(node)
        .iter()
        .map(|row| {
            content(row)
                .iter()
                .map(|cell| {
                    let blocks = render_blocks(content(cell));
                    let text = if blocks.is_empty() {
                        inline::inline(content(cell))
                    } else {
                        blocks
                    };
                    text.replace('\n', " ").replace('|', "\\|")
                })
                .collect()
        })
        .filter(|row: &Vec<String>| !row.is_empty())
        .collect();
    let Some(width) = rows.iter().map(Vec::len).max() else {
        return String::new();
    };
    let line = |cells: &[String]| {
        let mut padded = cells.to_vec();
        padded.resize(width, String::new());
        format!("| {} |", padded.join(" | "))
    };
    let mut lines = vec![line(&rows[0]), format!("|{}", " --- |".repeat(width))];
    lines.extend(rows.iter().skip(1).map(|row| line(row)));
    lines.join("\n")
}

fn fallback(node: &Value) -> String {
    let nested = content(node);
    if !nested.is_empty() {
        let blocks = render_blocks(nested);
        if !blocks.trim().is_empty() {
            return blocks;
        }
        let inline = inline::inline(nested);
        if !inline.trim().is_empty() {
            return inline;
        }
    }
    if let Some(text) = node
        .get("text")
        .and_then(Value::as_str)
        .filter(|text| !text.is_empty())
    {
        return text.to_string();
    }
    attr_str(node, "text").to_string()
}
