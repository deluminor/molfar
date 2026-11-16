use super::types::{VaultLink, VaultNote};
use std::collections::HashMap;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum LinkResolution {
    Resolved { path: String },
    Ambiguous,
    Missing,
    Attachment { path: Option<String> },
}

pub struct NoteIndex {
    paths: HashMap<String, ()>,
    names: HashMap<String, Vec<String>>,
}

pub fn normalize_vault_path(path: &str) -> Option<String> {
    if path.starts_with('/') || path.starts_with('\\') || has_drive_prefix(path) {
        return None;
    }
    let mut parts = Vec::new();
    let normalized = path.replace('\\', "/");
    for part in normalized.split('/') {
        if part.is_empty() || part == "." {
            continue;
        }
        if part == ".." {
            if parts.is_empty() {
                return None;
            }
            parts.pop();
        } else {
            parts.push(part);
        }
    }
    Some(parts.join("/"))
}

fn has_drive_prefix(path: &str) -> bool {
    let mut chars = path.chars();
    matches!(
        (chars.next(), chars.next()),
        (Some(letter), Some(':')) if letter.is_ascii_alphabetic()
    )
}

pub fn note_index(notes: &[VaultNote]) -> NoteIndex {
    let mut paths = HashMap::new();
    let mut names = HashMap::new();
    for note in notes {
        paths.insert(note.path.clone(), ());
        let basename = note.path.rsplit('/').next().unwrap_or(&note.path);
        for name in [basename.to_string(), stem(basename).to_string()]
            .into_iter()
            .chain(note.aliases.iter().cloned())
        {
            if name.is_empty() {
                continue;
            }
            let matches = names.entry(name.to_lowercase()).or_insert_with(Vec::new);
            if !matches.iter().any(|existing| existing == &note.path) {
                matches.push(note.path.clone());
            }
        }
    }
    NoteIndex { paths, names }
}

fn stem(basename: &str) -> &str {
    let lower = basename.to_ascii_lowercase();
    if lower.ends_with(".markdown") {
        &basename[..basename.len() - ".markdown".len()]
    } else if lower.ends_with(".md") {
        &basename[..basename.len() - 3]
    } else {
        basename
    }
}

pub fn resolve_vault_link(index: &NoteIndex, source: &str, link: &VaultLink) -> LinkResolution {
    let mut target = link
        .target
        .trim()
        .split('|')
        .next()
        .unwrap_or("")
        .trim()
        .to_string();
    if has_scheme(&target) || target.starts_with("//") {
        return LinkResolution::Attachment { path: None };
    }
    if let Some((before, _)) = target.split_once('#') {
        target = before.to_string();
    }
    let Some(target) = decode_component(&target) else {
        return LinkResolution::Missing;
    };
    if target.is_empty() {
        return LinkResolution::Resolved {
            path: source.into(),
        };
    }
    let parent = source.rsplit_once('/').map(|(dir, _)| dir).unwrap_or("");
    let joined = if parent.is_empty() {
        target.clone()
    } else {
        format!("{parent}/{target}")
    };
    let relative = normalize_vault_path(&joined);
    let root_path = normalize_vault_path(&target);
    let candidates: Vec<Option<String>> = if link.kind == "markdown" {
        vec![relative.clone()]
    } else {
        vec![root_path.clone(), relative.clone()]
    };
    for candidate in candidates.into_iter().flatten() {
        for path in [
            candidate.clone(),
            format!("{candidate}.md"),
            format!("{candidate}.markdown"),
        ] {
            if index.paths.contains_key(&path) {
                return LinkResolution::Resolved { path };
            }
        }
    }
    if link.kind == "wiki" && !target.contains('/') {
        if let Some(matches) = index.names.get(&target.to_lowercase()) {
            if matches.len() > 1 {
                return LinkResolution::Ambiguous;
            }
            if let Some(path) = matches.first() {
                return LinkResolution::Resolved { path: path.clone() };
            }
        }
    }
    if foreign_extension(&target) {
        return LinkResolution::Attachment {
            path: relative.or(root_path),
        };
    }
    LinkResolution::Missing
}

pub fn backlinks(notes: &[VaultNote], path: &str) -> Vec<(String, String)> {
    let index = note_index(notes);
    notes
        .iter()
        .filter(|other| other.path != path)
        .filter(|other| {
            other.links.iter().any(|link| {
                matches!(
                    resolve_vault_link(&index, &other.path, link),
                    LinkResolution::Resolved { path: ref dest } if dest == path
                )
            })
        })
        .map(|other| (other.path.clone(), other.title.clone()))
        .collect()
}

fn has_scheme(target: &str) -> bool {
    let mut chars = target.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    if !first.is_ascii_alphabetic() {
        return false;
    }
    for character in chars {
        if character == ':' {
            return true;
        }
        if !(character.is_ascii_alphanumeric() || matches!(character, '+' | '.' | '-')) {
            return false;
        }
    }
    false
}

fn foreign_extension(target: &str) -> bool {
    let name = target.rsplit(['/', '\\']).next().unwrap_or(target);
    let Some((_, extension)) = name.rsplit_once('.') else {
        return false;
    };
    if extension.is_empty() {
        return false;
    }
    let extension = extension.to_ascii_lowercase();
    extension != "md" && extension != "markdown"
}

pub fn decode_component(input: &str) -> Option<String> {
    let bytes = input.as_bytes();
    let mut out = Vec::new();
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            if index + 2 >= bytes.len() {
                return None;
            }
            let hex = std::str::from_utf8(&bytes[index + 1..index + 3]).ok()?;
            out.push(u8::from_str_radix(hex, 16).ok()?);
            index += 3;
        } else {
            out.push(bytes[index]);
            index += 1;
        }
    }
    String::from_utf8(out).ok()
}

pub fn encode_component(value: &str) -> String {
    let mut out = String::new();
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(byte as char)
            }
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}
