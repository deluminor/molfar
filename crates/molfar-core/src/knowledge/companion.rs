use super::constants::{BODY_MAX, NOTES_MAX, NOT_IN_VAULT};
use super::links::{self, note_index, resolve_vault_link, LinkResolution};
use super::types::{VaultDocument, VaultNote, VaultSnapshot};
use serde_json::{json, Value};

pub fn disconnected() -> Value {
    json!({"connected": false})
}

pub fn shape_index(snapshot: &VaultSnapshot) -> Value {
    let mut notes = snapshot.notes.clone();
    notes.sort_by(|left, right| left.path.cmp(&right.path));
    let truncated = snapshot.truncated || notes.len() > NOTES_MAX;
    notes.truncate(NOTES_MAX);
    let index = note_index(&notes);
    json!({
        "connected": true,
        "name": snapshot.connection.name,
        "notes": notes.iter().map(|note| json!({
            "path": note.path,
            "title": note.title,
            "tags": note.tags,
            "aliases": note.aliases,
            "links": resolved_links(&index, &note.path, note),
        })).collect::<Vec<_>>(),
        "truncated": truncated,
    })
}

pub fn shape_note(
    snapshot: &VaultSnapshot,
    path: &str,
    document: &VaultDocument,
) -> Result<Value, String> {
    let Some(note) = snapshot.notes.iter().find(|note| note.path == path) else {
        return Err(NOT_IN_VAULT.into());
    };
    let index = note_index(&snapshot.notes);
    let (body, truncated) = truncate_body(&document.body);
    Ok(json!({
        "path": path,
        "title": note.title,
        "tags": note.tags,
        "body": body,
        "truncated": truncated,
        "revision": document.revision,
        "links": resolved_links(&index, path, note),
        "backlinks": links::backlinks(&snapshot.notes, path)
            .into_iter()
            .map(|(path, title)| json!({"path": path, "title": title}))
            .collect::<Vec<_>>(),
    }))
}

fn resolved_links(index: &links::NoteIndex, path: &str, note: &VaultNote) -> Vec<Value> {
    note.links
        .iter()
        .filter_map(|link| match resolve_vault_link(index, path, link) {
            LinkResolution::Resolved { path: dest } => {
                Some(json!({"target": link.target, "path": dest}))
            }
            _ => None,
        })
        .collect()
}

fn truncate_body(body: &str) -> (String, bool) {
    if body.len() <= BODY_MAX {
        return (body.to_string(), false);
    }
    let mut end = BODY_MAX.min(body.len());
    while end > 0 && !body.is_char_boundary(end) {
        end -= 1;
    }
    (format!("{}\n\n…", &body[..end]), true)
}
