use crate::{files::path_key, notes::Note};
use serde_json::{json, Value};

pub(super) fn same_project(left: &str, right: &str) -> bool {
    path_key(left) == path_key(right)
}

fn allowed(note: &Note, projects: &[String], include_unscoped: bool) -> bool {
    match note.source_cwd.as_deref() {
        Some(cwd) => projects.iter().any(|project| same_project(project, cwd)),
        None => include_unscoped,
    }
}

pub(super) fn find<'a>(
    notes: &'a [Note],
    id: &str,
    projects: &[String],
    include_unscoped: bool,
) -> Result<&'a Note, String> {
    notes
        .iter()
        .find(|note| allowed(note, projects, include_unscoped) && matches_id(note, id))
        .ok_or_else(|| "Note not found in this project".into())
}

pub(super) fn matches_id(note: &Note, id: &str) -> bool {
    note.id == id
        || note.id.strip_prefix("gpui-note-") == Some(id)
        || id
            .parse::<u64>()
            .is_ok_and(|number| crate::store::desktop_session_handle(&note.id) as u64 == number)
}

pub(super) fn list(
    notes: &[Note],
    projects: &[String],
    include_unscoped: bool,
    offset: usize,
    limit: usize,
) -> Value {
    let notes: Vec<_> = notes
        .iter()
        .filter(|note| allowed(note, projects, include_unscoped))
        .collect();
    json!({
        "total":notes.len(),"offset":offset,
        "notes":notes.iter().skip(offset).take(limit).map(|note|json!({
            "id":note.id,"title":note.title,"preview":note.preview(),"tags":note.tags,"sourceCwd":note.source_cwd
        })).collect::<Vec<_>>(),
    })
}
