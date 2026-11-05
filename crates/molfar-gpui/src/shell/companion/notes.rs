use super::*;

impl Shell {
    pub(super) fn companion_notes_list(&self, input: &Value) -> Result<Value, String> {
        let query = input["query"].as_str().unwrap_or("").trim().to_lowercase();
        let mut notes = locked(&self.store)?.list_notes()?;
        notes.retain(|note| {
            query.is_empty()
                || note.title.to_lowercase().contains(&query)
                || note.body.to_lowercase().contains(&query)
                || note
                    .tags
                    .iter()
                    .any(|tag| tag.to_lowercase().contains(&query))
        });
        notes.sort_by_key(|note| std::cmp::Reverse(note.updated_at));
        notes.truncate(200);
        Ok(json!(
            notes
                .into_iter()
                .map(|note| json!({
                    "id": note.id,
                    "title": note.title,
                    "updatedAt": note.updated_at,
                    "tags": note.tags,
                }))
                .collect::<Vec<_>>()
        ))
    }

    pub(super) fn companion_notes_read(&self, input: &Value) -> Result<Value, String> {
        let id = required(input, "id")?;
        locked(&self.store)?
            .get_note(&id)?
            .map(|note| json!(note))
            .ok_or("Note not found".into())
    }

    pub(super) fn companion_notes_create(&self, input: &Value) -> Result<Value, String> {
        let body = input["body"].as_str().unwrap_or("");
        if body.trim().is_empty() || body.len() > 1_000_000 {
            return Err("body must be non-empty text".into());
        }
        let title = body
            .lines()
            .next()
            .unwrap_or("Note")
            .trim()
            .chars()
            .take(200)
            .collect::<String>();
        let tags = input["tags"]
            .as_array()
            .map(|tags| {
                tags.iter()
                    .filter_map(|tag| tag.as_str().map(str::to_string))
                    .take(20)
                    .collect()
            })
            .unwrap_or_default();
        let store = locked(&self.store)?;
        let created = store.create_note(None)?;
        let note = store.upsert_note(&molfar_core::notes::NoteUpsert {
            id: created.id,
            title,
            body: body.to_string(),
            tags,
            source_session_id: None,
            source_cwd: None,
            finalize_slug: true,
        })?;
        Ok(json!(note))
    }
}
