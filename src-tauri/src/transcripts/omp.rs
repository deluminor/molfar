use std::collections::{HashMap, HashSet};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::dirs_home;

use crate::transcripts::omp_interjections::parse_omp_interjections;

#[derive(Serialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OmpInterjectionAnchor {
    pub(super) id: String,
    pub(super) after_assistant_text: String,
    pub(super) after_occurrence: usize,
    pub(super) after_assistant_text_concat: String,
    pub(super) after_concat_occurrence: usize,
    /// A directly following text-only answer can have been coalesced into the
    /// parent block by old builds. Require both full texts before splitting it.
    pub(super) following_assistant_text: Option<String>,
    pub(super) following_assistant_text_concat: Option<String>,
    pub(super) text: String,
    pub(super) custom_type: String,
    pub(super) severity: Option<String>,
}

/// One active-path assistant message in file order. Both join forms of its
/// text parts are alternatives for the same message, never two messages.
#[derive(Serialize, Debug, PartialEq, Eq)]
pub struct OmpAssistantText {
    text: String,
    concat: String,
}

/// Recover displayed OMP custom messages that older MOLFAR builds omitted
/// from their persisted transcript. The provider id is already stored with the
/// session; matching the original JSONL keeps the repair deterministic instead
/// of guessing from neighbouring reasoning text.
#[tauri::command(async)]
pub fn omp_session_interjections(
    provider_session_id: String,
) -> Result<Vec<OmpInterjectionAnchor>, String> {
    let Some(path) = omp_session_path(&provider_session_id)? else {
        return Ok(Vec::new());
    };
    parse_omp_interjections(&path)
}

#[tauri::command(async)]
pub fn omp_active_assistant_texts(
    provider_session_id: String,
) -> Result<Vec<OmpAssistantText>, String> {
    let Some(path) = omp_session_path(&provider_session_id)? else {
        return Ok(Vec::new());
    };
    active_omp_assistant_texts(&path)
}

fn omp_session_path(provider_session_id: &str) -> Result<Option<PathBuf>, String> {
    if provider_session_id.is_empty()
        || !provider_session_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
    {
        return Err("Invalid OMP provider session id".into());
    }
    let root = dirs_home()
        .map(PathBuf::from)
        .ok_or("Home directory is unavailable")?
        .join(".omp/agent/sessions");
    Ok(find_omp_session_file(&root, provider_session_id))
}

fn find_omp_session_file(root: &Path, provider_session_id: &str) -> Option<PathBuf> {
    let suffix = format!("_{provider_session_id}.jsonl");
    let projects = std::fs::read_dir(root).ok()?;
    for project in projects.flatten() {
        let path = project.path();
        if path.is_file()
            && path
                .file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.ends_with(&suffix))
        {
            return Some(path);
        }
        if !path.is_dir() {
            continue;
        }
        let Ok(entries) = std::fs::read_dir(path) else {
            continue;
        };
        for entry in entries.flatten() {
            let candidate = entry.path();
            if candidate.is_file()
                && candidate
                    .file_name()
                    .and_then(|name| name.to_str())
                    .is_some_and(|name| name.ends_with(&suffix))
            {
                return Some(candidate);
            }
        }
    }
    None
}

pub(super) fn omp_message_text(value: &serde_json::Value, separator: &str) -> String {
    if let Some(text) = value.as_str() {
        return text.to_owned();
    }
    value
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|part| {
            (part.get("type").and_then(serde_json::Value::as_str) == Some("text"))
                .then(|| part.get("text").and_then(serde_json::Value::as_str))
                .flatten()
        })
        .collect::<Vec<_>>()
        .join(separator)
}

pub(super) fn read_omp_entries(path: &Path) -> Result<Vec<serde_json::Value>, String> {
    let file = std::fs::File::open(path).map_err(|error| format!("{}: {error}", path.display()))?;
    let mut entries = Vec::new();
    for line in BufReader::new(file).lines() {
        let Ok(line) = line else { continue };
        let Ok(value) = serde_json::from_str::<serde_json::Value>(&line) else {
            continue;
        };
        entries.push(value);
    }
    Ok(entries)
}

pub(super) fn omp_active_ids(entries: &[serde_json::Value]) -> HashSet<&str> {
    let nodes: HashMap<_, _> = entries
        .iter()
        .filter_map(|value| value["id"].as_str().map(|id| (id, value)))
        .collect();
    let mut active = HashSet::new();
    let mut cursor = entries.last().and_then(|value| value["id"].as_str());
    while let Some(id) = cursor {
        if !active.insert(id) {
            break;
        }
        cursor = nodes.get(id).and_then(|value| value["parentId"].as_str());
    }
    active
}

// Return the ordered sequence, not per-text counts: a status split may only
// be merged with the message at its own source position.
fn active_omp_assistant_texts(path: &Path) -> Result<Vec<OmpAssistantText>, String> {
    let entries = read_omp_entries(path)?;
    let active = omp_active_ids(&entries);
    Ok(entries
        .iter()
        .filter(|value| {
            value["type"] == "message"
                && value["message"]["role"] == "assistant"
                && value["id"].as_str().is_some_and(|id| active.contains(id))
        })
        .map(|value| {
            let content = &value["message"]["content"];
            OmpAssistantText {
                text: omp_message_text(content, "\n"),
                concat: omp_message_text(content, ""),
            }
        })
        .filter(|message| !message.text.trim().is_empty())
        .collect())
}

#[cfg(test)]
mod tests;
