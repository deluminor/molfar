use super::service::{Event, VaultService};
use gpui::{Context, Task};
use molfar_core::{
    external_mcp::{
        shape::knowledge as shape,
        tools::{
            knowledge::{Links, Read, Search},
            parse,
        },
    },
    knowledge::{
        VaultConnection,
        external::{NOTE_NOT_FOUND, NoteEdit, VAULT_NOT_FOUND},
    },
};
use serde_json::Value;

impl VaultService {
    pub(crate) fn external_knowledge_read(
        &mut self,
        connection: VaultConnection,
        tool: &str,
        arguments: &Value,
        cx: &mut Context<Self>,
    ) -> Result<Task<Result<Value, String>>, String> {
        if tool == "knowledge_read" {
            let input: Read = parse(arguments)?;
            let host = self.host.clone();
            return Ok(cx.background_executor().spawn(async move {
                let note = host.external_read(&connection.id, &input.path)?;
                shape::document(note, input.max_chars, input.char_offset)
            }));
        }

        let scan = self.snapshot(false, cx);
        if tool == "knowledge_search" {
            let input: Search = parse(arguments)?;
            return Ok(cx.spawn(async move |_, _| {
                let snapshot = scan.await?;
                if snapshot.connection.id != connection.id {
                    return Err(VAULT_NOT_FOUND.into());
                }
                shape::search(&snapshot.notes, &input)
            }));
        }

        let input: Links = parse(arguments)?;
        let neighbors = tool == "knowledge_neighbors";
        Ok(cx.spawn(async move |_, _| {
            let snapshot = scan.await?;
            if snapshot.connection.id != connection.id {
                return Err(VAULT_NOT_FOUND.into());
            }
            let note = snapshot
                .notes
                .iter()
                .find(|note| note.path == input.path)
                .ok_or(NOTE_NOT_FOUND)?;
            shape::links(&snapshot.notes, note, neighbors, input.limit, input.offset)
        }))
    }

    pub(crate) fn external_knowledge_edit(
        &mut self,
        connection: VaultConnection,
        path: String,
        expected: String,
        edit: NoteEdit,
        cx: &mut Context<Self>,
    ) -> Task<Result<Value, String>> {
        let host = self.host.clone();
        let work = cx
            .background_executor()
            .spawn(async move { host.external_edit(&connection.id, &path, &expected, edit) });
        cx.spawn(async move |this, cx| {
            let result = work.await;
            if result.is_ok() {
                let _ = this.update(cx, |service, cx| service.external_note_changed(cx));
            }
            result
        })
    }

    fn external_note_changed(&mut self, cx: &mut Context<Self>) {
        self.invalidate();
        cx.emit(Event::Changed);
    }
}
