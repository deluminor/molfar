use super::links::{
    decode_component, encode_component, normalize_vault_path, note_index, resolve_vault_link,
    LinkResolution,
};
use super::types::{VaultLink, VaultNote};

const SCHEME: &str = "molfar-vault:";

pub fn prepare_preview(body: &str, notes: &[VaultNote], selected: &str) -> String {
    let index = note_index(notes);
    let mut fence: Option<(char, usize)> = None;
    let mut out = String::new();
    for line in body.split_inclusive('\n') {
        let (content, ending) = split_ending(line);
        let trimmed = content.trim_end_matches('\r');
        if let Some(marker) = fence_marker(trimmed) {
            fence = match fence {
                None => Some(marker),
                Some((kind, length)) if marker.0 == kind && marker.1 >= length => None,
                Some(open) => Some(open),
            };
            out.push_str(line);
            continue;
        }
        if fence.is_some() || trimmed.starts_with("    ") {
            out.push_str(line);
            continue;
        }
        if let Some(rewritten) = rewrite_definition(trimmed, &index, selected) {
            out.push_str(&rewritten);
            out.push_str(ending);
            continue;
        }
        for (code, part) in split_inline_code(trimmed) {
            if code {
                out.push_str(part);
            } else {
                out.push_str(&convert_segment(part, &index, selected));
            }
        }
        out.push_str(ending);
    }
    out
}

pub fn vault_target(url: &str) -> Option<String> {
    let encoded = url.strip_prefix(SCHEME)?;
    let path = decode_component(encoded)?;
    (normalize_vault_path(&path).as_deref() == Some(path.as_str())).then_some(path)
}

fn split_ending(line: &str) -> (&str, &str) {
    if let Some(content) = line.strip_suffix("\r\n") {
        (content, "\r\n")
    } else if let Some(content) = line.strip_suffix('\n') {
        (content, "\n")
    } else {
        (line, "")
    }
}

pub(super) fn fence_marker(line: &str) -> Option<(char, usize)> {
    let rest = line.trim_start_matches(' ');
    if line.len() - rest.len() > 3 {
        return None;
    }
    let marker = rest.chars().next()?;
    if marker != '`' && marker != '~' {
        return None;
    }
    let length = rest
        .chars()
        .take_while(|character| *character == marker)
        .count();
    (length >= 3).then_some((marker, length))
}

pub(super) fn split_inline_code(line: &str) -> Vec<(bool, &str)> {
    let mut parts = Vec::new();
    let mut rest = line;
    while let Some(start) = rest.find('`') {
        if start > 0 {
            parts.push((false, &rest[..start]));
        }
        let ticks = rest[start..]
            .bytes()
            .take_while(|byte| *byte == b'`')
            .count();
        let after = &rest[start + ticks..];
        let marker = &rest[start..start + ticks];
        if let Some(end) = after.find(marker) {
            let close = start + ticks + end + ticks;
            parts.push((true, &rest[start..close]));
            rest = &rest[close..];
        } else {
            parts.push((false, rest));
            return parts;
        }
    }
    if !rest.is_empty() {
        parts.push((false, rest));
    }
    parts
}

fn rewrite_definition(
    line: &str,
    index: &super::links::NoteIndex,
    selected: &str,
) -> Option<String> {
    let indent = line
        .bytes()
        .take(3)
        .take_while(|byte| *byte == b' ')
        .count();
    let rest = &line[indent..];
    if !rest.starts_with('[') || rest.starts_with("[^") {
        return None;
    }
    let close = rest.find("]:")?;
    let raw = rest[close + 2..].trim();
    if raw.is_empty() {
        return None;
    }
    let target = link_destination(raw);
    if is_external(&target) {
        return Some(line.to_string());
    }
    let link = VaultLink {
        target,
        kind: "markdown".into(),
    };
    let prefix = &line[..indent + close + 2];
    Some(match resolve_vault_link(index, selected, &link) {
        LinkResolution::Resolved { path } => {
            format!("{prefix} {SCHEME}{}", encode_component(&path))
        }
        _ => String::new(),
    })
}

fn convert_segment(text: &str, index: &super::links::NoteIndex, selected: &str) -> String {
    replace_markdown(&replace_wiki(text, index, selected), index, selected)
}

fn replace_wiki(text: &str, index: &super::links::NoteIndex, selected: &str) -> String {
    let mut out = String::new();
    let mut rest = text;
    while let Some(start) = rest.find("[[") {
        let escaped = rest[..start]
            .chars()
            .rev()
            .take_while(|character| *character == '\\')
            .count()
            % 2
            == 1;
        if escaped {
            out.push_str(&rest[..start + 2]);
            rest = &rest[start + 2..];
            continue;
        }
        let Some(end) = rest[start + 2..].find("]]") else {
            break;
        };
        out.push_str(&rest[..start]);
        let contents = &rest[start + 2..start + 2 + end];
        let (target, alias) = contents.split_once('|').unwrap_or((contents, ""));
        let label = if alias.trim().is_empty() {
            target
        } else {
            alias
        };
        let link = VaultLink {
            target: target.trim().into(),
            kind: "wiki".into(),
        };
        out.push_str(&render_resolved(label, &link, index, selected));
        rest = &rest[start + 2 + end + 2..];
    }
    out.push_str(rest);
    out
}

fn replace_markdown(text: &str, index: &super::links::NoteIndex, selected: &str) -> String {
    let mut out = String::new();
    let bytes = text.as_bytes();
    let mut index_at = 0;
    while index_at < bytes.len() {
        let rest = &text[index_at..];
        let Some(start) = rest.find('[') else {
            out.push_str(rest);
            break;
        };
        let image = start > 0 && rest.as_bytes()[start - 1] == b'!';
        let from = if image { start - 1 } else { start };
        let Some(label_end) = rest[start + 1..].find(']') else {
            out.push_str(rest);
            break;
        };
        let label = &rest[start + 1..start + 1 + label_end];
        let after = start + 1 + label_end;
        if !rest[after..].starts_with("](") {
            out.push_str(&rest[..after + 1]);
            index_at += after + 1;
            continue;
        }
        let Some(dest_end) = rest[after + 2..].find(')') else {
            out.push_str(rest);
            break;
        };
        out.push_str(&rest[..from]);
        let raw = &rest[after + 2..after + 2 + dest_end];
        let target = link_destination(raw);
        if image || is_external(&target) {
            let end = after + 2 + dest_end + 1;
            if image && !is_external(&target) {
                out.push_str(&escape_label(if label.is_empty() {
                    &target
                } else {
                    label
                }));
            } else {
                out.push_str(&rest[from..end]);
            }
        } else {
            let link = VaultLink {
                target,
                kind: "markdown".into(),
            };
            out.push_str(&render_resolved(label, &link, index, selected));
        }
        index_at += after + 2 + dest_end + 1;
    }
    out
}

fn render_resolved(
    label: &str,
    link: &VaultLink,
    index: &super::links::NoteIndex,
    selected: &str,
) -> String {
    let shown = escape_label(label);
    match resolve_vault_link(index, selected, link) {
        LinkResolution::Resolved { path } => {
            format!("[{shown}]({SCHEME}{})", encode_component(&path))
        }
        _ => shown,
    }
}

fn escape_label(value: &str) -> String {
    let mut out = String::new();
    for character in value.chars() {
        match character {
            '\n' | '\r' => out.push(' '),
            '[' | ']' | '\\' => {
                out.push('\\');
                out.push(character);
            }
            _ => out.push(character),
        }
    }
    out
}

fn is_external(target: &str) -> bool {
    target.starts_with("http://")
        || target.starts_with("https://")
        || target.starts_with(SCHEME)
        || target.starts_with(super::assets::ASSET_SCHEME)
        || target.starts_with("mailto:")
}

fn link_destination(raw: &str) -> String {
    let value = raw.trim();
    if let Some(inner) = value.strip_prefix('<') {
        if let Some(end) = inner.find('>') {
            if !inner[..end].contains('\n') {
                return inner[..end].to_string();
            }
        }
    }
    value.split_whitespace().next().unwrap_or("").to_string()
}
