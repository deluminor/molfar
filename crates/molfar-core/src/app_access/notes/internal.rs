use super::{scope, upsert};
use crate::{app_access::bounded, store::Store};
use serde_json::{json, Value};

/// Notes use their actual persisted string IDs, including desktop-created notes.
pub fn notes_action(
    store: &Store,
    caller: i64,
    request: &str,
    action: &str,
    input: &Value,
    projects: &[String],
) -> Result<Value, String> {
    let notes = store.list_notes()?;
    let id = input
        .get("id")
        .map(|v| {
            v.as_str()
                .map(str::to_owned)
                .or_else(|| v.as_u64().map(|id| id.to_string()))
                .ok_or("id must be a note ID")
        })
        .transpose()?;
    if action == "notes.list" {
        let limit = bounded(input, "limit", 30, 1, 100)?;
        let offset = bounded(input, "offset", 0, 0, usize::MAX)?;
        return Ok(scope::list(&notes, projects, true, offset, limit));
    }
    let current = id
        .as_deref()
        .map(|id| scope::find(&notes, id, projects, true))
        .transpose()?;
    if action == "notes.read" {
        return current.map(|note| json!(note)).ok_or("Provide id".into());
    }
    let id = current.map(|n| n.id.clone()).or(id).unwrap_or_else(|| {
        format!(
            "app-note-{caller}-{}",
            crate::familiar::files::content_hash(request)
        )
    });
    let fields = upsert::Fields::parse(input)?;
    let source_session_id = match current {
        Some(note) => note.source_session_id.clone(),
        None => Some(store.persisted_session_id(caller)?),
    };
    let source_cwd = current
        .map(|note| note.source_cwd.clone())
        .unwrap_or_else(|| projects.first().cloned());
    let note =
        store.upsert_note(&fields.into_upsert(id, current, source_session_id, source_cwd)?)?;
    Ok(json!(note))
}
