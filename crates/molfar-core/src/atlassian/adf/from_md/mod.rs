mod rows;
mod scan;

use serde_json::{json, Value};

pub fn from_markdown(markdown: &str) -> Value {
    let normalized = markdown.replace("\r\n", "\n");
    let lines: Vec<&str> = normalized.lines().collect();
    json!({
        "type": "doc",
        "version": 1,
        "content": blocks(&lines)
    })
}

fn blocks(lines: &[&str]) -> Vec<Value> {
    let mut content = Vec::new();
    let mut index = 0;
    while index < lines.len() {
        if lines[index].trim().is_empty() {
            index += 1;
            continue;
        }
        let (node, next) = block(lines, index);
        content.push(node);
        index = next.max(index + 1);
    }
    content
}

fn block(lines: &[&str], index: usize) -> (Value, usize) {
    let line = lines[index];
    if let Some(parsed) = fence(lines, index) {
        return parsed;
    }
    if let Some(parsed) = callout(lines, index) {
        return parsed;
    }
    if line.trim_start().starts_with('|') {
        return rows::table(lines, index);
    }
    if rows::is_list(line.trim()) {
        return rows::list(lines, index);
    }
    if let Some((level, text)) = heading(line.trim()) {
        return (
            json!({"type":"heading","attrs":{"level":level},"content":scan::inline(text)}),
            index + 1,
        );
    }
    if let Some(image) = image_line(line.trim()) {
        return (image, index + 1);
    }
    paragraph(lines, index)
}

fn fence(lines: &[&str], index: usize) -> Option<(Value, usize)> {
    let language = lines[index].trim().strip_prefix("```")?;
    if language.contains('`') {
        return None;
    }
    let mut cursor = index + 1;
    let mut code = String::new();
    while cursor < lines.len() && lines[cursor].trim() != "```" {
        if !code.is_empty() {
            code.push('\n');
        }
        code.push_str(lines[cursor]);
        cursor += 1;
    }
    let next = if cursor < lines.len() {
        cursor + 1
    } else {
        cursor
    };
    Some((
        json!({"type":"codeBlock","attrs":{"language":language.trim()},"content":[{"type":"text","text":code}]}),
        next,
    ))
}

fn callout(lines: &[&str], index: usize) -> Option<(Value, usize)> {
    let rest = lines[index]
        .trim()
        .strip_prefix('>')?
        .trim_start()
        .strip_prefix("[!")?;
    let (kind, _) = rest.split_once(']')?;
    let panel_type = match kind.to_ascii_lowercase().as_str() {
        "info" | "note" | "warning" | "error" | "success" => kind.to_ascii_lowercase(),
        "danger" | "failure" | "fail" => "error".into(),
        other
            if other
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') =>
        {
            "note".into()
        }
        _ => return None,
    };
    let mut cursor = index + 1;
    let mut body = Vec::new();
    while cursor < lines.len() && lines[cursor].trim_start().starts_with('>') {
        let stripped = lines[cursor].trim_start().trim_start_matches('>');
        body.push(stripped.strip_prefix(' ').unwrap_or(stripped));
        cursor += 1;
    }
    let inner = from_markdown(&body.join("\n"));
    Some((
        json!({"type":"panel","attrs":{"panelType":panel_type},"content":inner["content"]}),
        cursor,
    ))
}

fn heading(line: &str) -> Option<(u64, &str)> {
    let level = line.chars().take_while(|char| *char == '#').count();
    if !(1..=6).contains(&level) {
        return None;
    }
    let text = line[level..].strip_prefix(' ')?;
    Some((level as u64, text))
}

fn image_line(line: &str) -> Option<Value> {
    let rest = line.strip_prefix("![")?;
    let (alt, rest) = rest.split_once("](")?;
    let url = rest.strip_suffix(')')?;
    if url.is_empty() || url.contains(char::is_whitespace) {
        return None;
    }
    Some(json!({
        "type": "paragraph",
        "content": [scan::text_node(if alt.is_empty() { url } else { alt }, vec![scan::link_mark(url)])]
    }))
}

fn paragraph(lines: &[&str], index: usize) -> (Value, usize) {
    let mut cursor = index + 1;
    let mut text = lines[index].to_string();
    while cursor < lines.len() && !lines[cursor].trim().is_empty() && !special(lines[cursor]) {
        text.push('\n');
        text.push_str(lines[cursor]);
        cursor += 1;
    }
    (
        json!({"type":"paragraph","content":scan::inline(&text)}),
        cursor,
    )
}

fn special(line: &str) -> bool {
    let line = line.trim();
    line.starts_with("```")
        || line.starts_with("> [!")
        || line.starts_with('|')
        || line.starts_with("![")
        || heading(line).is_some()
        || rows::is_list(line)
}
