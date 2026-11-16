use std::collections::{HashMap, HashSet};
use std::path::Path;

use crate::transcripts::omp::{
    omp_active_ids, omp_message_text, read_omp_entries, OmpInterjectionAnchor,
};

pub(super) fn parse_omp_interjections(path: &Path) -> Result<Vec<OmpInterjectionAnchor>, String> {
    let entries = read_omp_entries(path)?;
    let nodes: HashMap<_, _> = entries
        .iter()
        .filter_map(|value| value["id"].as_str().map(|id| (id, value)))
        .collect();
    let active = omp_active_ids(&entries);
    let mut assistants: HashMap<&str, (String, usize, String, usize)> = HashMap::new();
    let mut occurrences: HashMap<String, usize> = HashMap::new();
    let mut concat_occurrences: HashMap<String, usize> = HashMap::new();
    let mut out: Vec<OmpInterjectionAnchor> = Vec::new();
    // Metadata and compaction participate in ancestry, not anchor text.
    // Keep file order for occurrences and notes, but exclude abandoned branches.
    for value in &entries {
        if !value["id"].as_str().is_some_and(|id| active.contains(id)) {
            continue;
        }
        match value.get("type").and_then(serde_json::Value::as_str) {
            Some("message")
                if value
                    .pointer("/message/role")
                    .and_then(serde_json::Value::as_str)
                    == Some("assistant") =>
            {
                let Some(id) = value.get("id").and_then(serde_json::Value::as_str) else {
                    continue;
                };
                let text = omp_message_text(&value["message"]["content"], "\n");
                let concat_text = omp_message_text(&value["message"]["content"], "");
                if text.trim().is_empty() {
                    continue;
                }
                if let Some(anchor) = out.last_mut() {
                    let text_only = value["message"]["content"]
                        .as_array()
                        .is_some_and(|parts| parts.iter().all(|part| part["type"] == "text"));
                    if text_only
                        && value.get("parentId").and_then(serde_json::Value::as_str)
                            == Some(anchor.id.as_str())
                    {
                        anchor.following_assistant_text = Some(text.clone());
                        anchor.following_assistant_text_concat = Some(concat_text.clone());
                    }
                }
                let occurrence = occurrences.entry(text.clone()).or_default();
                *occurrence += 1;
                let concat_occurrence = concat_occurrences.entry(concat_text.clone()).or_default();
                *concat_occurrence += 1;
                assistants.insert(id, (text, *occurrence, concat_text, *concat_occurrence));
            }
            Some("custom_message")
                if value.get("display").and_then(serde_json::Value::as_bool) == Some(true) =>
            {
                let Some(id) = value.get("id").and_then(serde_json::Value::as_str) else {
                    continue;
                };
                let Some(parent_id) = value.get("parentId").and_then(serde_json::Value::as_str)
                else {
                    continue;
                };
                let mut ancestor = Some(parent_id);
                let mut seen = HashSet::new();
                let mut assistant = None;
                while let Some(id) = ancestor {
                    if !active.contains(id) || !seen.insert(id) {
                        break;
                    }
                    if let Some(found) = assistants.get(id) {
                        assistant = Some(found);
                        break;
                    }
                    let Some(parent) = nodes.get(id) else { break };
                    if matches!(
                        parent
                            .pointer("/message/role")
                            .and_then(serde_json::Value::as_str),
                        Some("user" | "assistant")
                    ) {
                        break;
                    }
                    ancestor = parent["parentId"].as_str();
                }
                let Some((after_assistant_text, after_occurrence, concat_text, concat_occurrence)) =
                    assistant
                else {
                    continue;
                };
                let custom_type = value
                    .get("customType")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or("custom")
                    .to_owned();
                let mut severity = None;
                let mut note_bodies = Vec::new();
                if custom_type == "advisor" {
                    for note in value
                        .pointer("/details/notes")
                        .and_then(serde_json::Value::as_array)
                        .into_iter()
                        .flatten()
                    {
                        if let Some(body) = note.get("note").and_then(serde_json::Value::as_str) {
                            note_bodies.push(body);
                        }
                        let next = note.get("severity").and_then(serde_json::Value::as_str);
                        if next == Some("blocker")
                            || (next == Some("concern") && severity.as_deref() != Some("blocker"))
                            || (next == Some("nit") && severity.is_none())
                        {
                            severity = next.map(str::to_owned);
                        }
                    }
                }
                let text = if note_bodies.is_empty() {
                    omp_message_text(&value["content"], "\n")
                } else {
                    note_bodies.join("\n\n")
                };
                // Tool results, metadata and note chains seal the same preceding
                // assistant prose. Notes resolving there stack in source order.
                out.push(OmpInterjectionAnchor {
                    id: id.to_owned(),
                    after_assistant_text: after_assistant_text.clone(),
                    after_occurrence: *after_occurrence,
                    after_assistant_text_concat: concat_text.clone(),
                    after_concat_occurrence: *concat_occurrence,
                    following_assistant_text: None,
                    following_assistant_text_concat: None,
                    text,
                    custom_type,
                    severity,
                });
            }
            _ => {}
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests;
