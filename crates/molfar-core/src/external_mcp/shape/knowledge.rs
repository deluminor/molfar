use super::page;
use crate::knowledge::{self, LinkResolution, VaultDocument, VaultNote};
use serde_json::{json, Value};

pub fn search(
    notes: &[VaultNote],
    input: &super::super::tools::knowledge::Search,
) -> Result<Value, String> {
    let query = input.query.trim().to_lowercase();
    let matches = notes
        .iter()
        .filter(|note| knowledge::note_matches(note, &query));
    page::list(
        "notes",
        matches.map(|note| json!({"path":note.path,"title":note.title,"tags":note.tags,"aliases":note.aliases})),
        input.limit,
        input.offset,
    )
}

pub fn links(
    notes: &[VaultNote],
    note: &VaultNote,
    neighbors: bool,
    limit: Option<usize>,
    offset: Option<usize>,
) -> Result<Value, String> {
    let mut links = knowledge::backlinks(notes, &note.path);
    if neighbors {
        let index = knowledge::note_index(notes);
        links.extend(note.links.iter().filter_map(|link| {
            let LinkResolution::Resolved { path } =
                knowledge::resolve_vault_link(&index, &note.path, link)
            else {
                return None;
            };
            let target = notes.iter().find(|note| note.path == path)?;
            Some((path, target.title.clone()))
        }));
        links.retain(|(path, _)| path != &note.path);
    }
    links.sort_unstable();
    links.dedup();
    page::list(
        "notes",
        links
            .into_iter()
            .map(|(path, title)| json!({"path":path,"title":title})),
        limit,
        offset,
    )
}

pub fn document(
    note: VaultDocument,
    max_chars: Option<usize>,
    char_offset: Option<usize>,
) -> Result<Value, String> {
    let (body, next) = page::text(&note.body, max_chars, char_offset)?;
    Ok(json!({"path":note.path,"revision":note.revision,"body":body,"nextCharOffset":next}))
}
