use serde_json::{json, Value};

pub(super) fn inline(text: &str) -> Vec<Value> {
    let mut nodes = Vec::new();
    for (index, line) in text.split('\n').enumerate() {
        if index > 0 {
            nodes.push(json!({"type":"hardBreak"}));
        }
        nodes.extend(scan(line));
    }
    nodes.retain(|node| node.get("text").and_then(Value::as_str) != Some(""));
    nodes
}

fn scan(line: &str) -> Vec<Value> {
    let mut nodes = Vec::new();
    let mut plain = String::new();
    let mut rest = line;
    while !rest.is_empty() {
        if let Some((node, taken)) = marked(rest) {
            if !plain.is_empty() {
                nodes.push(text_node(&plain, vec![]));
                plain.clear();
            }
            nodes.push(node);
            rest = &rest[taken..];
            continue;
        }
        let char = rest.chars().next().expect("rest is not empty");
        plain.push(char);
        rest = &rest[char.len_utf8()..];
    }
    if !plain.is_empty() {
        nodes.push(text_node(&plain, vec![]));
    }
    nodes
}

fn marked(rest: &str) -> Option<(Value, usize)> {
    wrapped(rest, "`", "`", "code")
        .or_else(|| wrapped(rest, "**", "**", "strong"))
        .or_else(|| wrapped(rest, "~~", "~~", "strike"))
        .or_else(|| link(rest))
        .or_else(|| wrapped(rest, "_", "_", "em"))
        .or_else(|| wrapped(rest, "*", "*", "em"))
}

fn wrapped(rest: &str, open: &str, close: &str, mark: &str) -> Option<(Value, usize)> {
    let body = rest.strip_prefix(open)?;
    let end = body.find(close)?;
    if end == 0 || body[..end].contains(open) {
        return None;
    }
    Some((
        text_node(&body[..end], vec![json!({"type":mark})]),
        open.len() + end + close.len(),
    ))
}

fn link(rest: &str) -> Option<(Value, usize)> {
    let body = rest.strip_prefix('[')?;
    let (label, after) = body.split_once("](")?;
    let (url, _) = after.split_once(')')?;
    if label.is_empty() || url.is_empty() || url.contains(char::is_whitespace) {
        return None;
    }
    Some((
        text_node(label, vec![link_mark(url)]),
        1 + label.len() + 2 + url.len() + 1,
    ))
}

pub(super) fn text_node(text: &str, marks: Vec<Value>) -> Value {
    if marks.is_empty() {
        json!({"type":"text","text":text})
    } else {
        json!({"type":"text","text":text,"marks":marks})
    }
}

pub(super) fn link_mark(href: &str) -> Value {
    json!({"type":"link","attrs":{"href":href}})
}
