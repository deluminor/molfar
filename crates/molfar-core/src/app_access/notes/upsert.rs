use crate::{
    app_access::optional_text,
    notes::{Note, NoteUpsert},
};
use serde_json::Value;

pub(super) struct Fields {
    title: Option<String>,
    body: Option<String>,
    tags: Option<Vec<String>>,
}

impl Fields {
    pub(super) fn parse(input: &Value) -> Result<Self, String> {
        let title = optional_text(input, "title", crate::notes::MAX_TITLE)?;
        let body = input
            .get("body")
            .map(|v| {
                v.as_str()
                    .filter(|s| s.len() <= 240_000)
                    .map(|s| s.replace("\r\n", "\n").replace('\r', "\n"))
                    .ok_or("body must be text under 240000 bytes")
            })
            .transpose()?;
        let tags = input
            .get("tags")
            .map(|v| serde_json::from_value::<Vec<String>>(v.clone()).map_err(|e| e.to_string()))
            .transpose()?;
        Ok(Self { title, body, tags })
    }

    pub(super) fn into_upsert(
        self,
        id: String,
        current: Option<&Note>,
        source_session_id: Option<String>,
        source_cwd: Option<String>,
    ) -> Result<NoteUpsert, String> {
        let Self { title, body, tags } = self;
        if current.is_some() && title.is_none() && body.is_none() && tags.is_none() {
            return Err("Supply title, body or tags to update a note".into());
        }
        let body = body
            .or_else(|| current.map(|note| note.body.clone()))
            .ok_or("body is required to create a note")?;
        let title = title
            .or_else(|| current.map(|note| note.title.clone()))
            .unwrap_or_else(|| crate::notes::title(&body));
        let tags = tags
            .or_else(|| current.map(|note| note.tags.clone()))
            .unwrap_or_default();
        Ok(NoteUpsert {
            id,
            title,
            body,
            tags,
            source_session_id,
            source_cwd,
            finalize_slug: true,
        })
    }
}
