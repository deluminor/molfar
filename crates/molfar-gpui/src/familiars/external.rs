use super::*;
use gpui::Task;
use molfar_core::{
    app_access::conversation_page,
    external_mcp::{
        shape::{familiars::profile, page},
        tools::familiars::{Include, Read},
    },
};
use serde_json::{Value, json};

pub(crate) const NOT_FOUND: &str = "Familiar not found.";

impl Familiars {
    pub(crate) fn external_roster(&self) -> &[Familiar] {
        &self.roster.familiars
    }

    pub(crate) fn external_familiar(&self, id: &str) -> Option<&Familiar> {
        self.roster.get(id)
    }

    pub(crate) fn external_read(
        &self,
        input: Read,
        cx: &mut Context<Self>,
    ) -> Result<Task<Result<Value, String>>, String> {
        let familiar = self.roster.get(&input.familiar_id).ok_or(NOT_FOUND)?;
        let mut result = profile(familiar);
        if input.include.is_empty() {
            return Ok(Task::ready(Ok(result)));
        }
        let root = self.root.clone();
        let id = familiar.id.clone();
        let session = familiar.session_id;
        let store = self.store.clone();
        let rows = if input.include.contains(&Include::Transcript) {
            self.open_chat(&id)
                .filter(|view| view.read(cx).history_loaded())
                .map(|view| view.read(cx).transcript.read(cx).source_rows().to_vec())
        } else {
            None
        };
        Ok(cx.background_executor().spawn(async move {
            if input.include.contains(&Include::Memory) {
                let memory = familiar::files::external_memory(&root, &id).map_err(|error| {
                    log::warn!("External MCP could not read Familiar memory: {error}");
                    "Familiar memory is unavailable."
                })?;
                let (memory, next) = page::text(&memory, input.max_chars, input.char_offset)?;
                result["memory"] = json!({"body":memory,"nextCharOffset":next});
            }
            if input.include.contains(&Include::Transcript) {
                let blocks = match session {
                    Some(session) => {
                        let store = locked(&store)?;
                        match rows {
                            Some(rows) => store.conversation_blocks_with_rows(session, &rows)?,
                            None => store.conversation_blocks(session)?,
                        }
                    }
                    None => Vec::new(),
                };
                let mut paging = json!({});
                for (name, value) in [
                    ("before", input.before),
                    ("limit", input.limit.map(|n| json!(n))),
                    ("maxChars", input.max_chars.map(|n| json!(n))),
                    ("charOffset", input.char_offset.map(|n| json!(n))),
                ] {
                    if let Some(value) = value {
                        paging[name] = value;
                    }
                }
                result["transcript"] = conversation_page(&blocks, &paging)?;
            }
            Ok(result)
        }))
    }

    pub(crate) fn external_create(
        &mut self,
        id: &str,
        name: Option<&str>,
        mascot: Option<&str>,
        color: Option<&str>,
        cx: &mut Context<Self>,
    ) -> Result<Value, String> {
        if self.roster.get(id).is_some() {
            return Ok(json!({"familiarId":id}));
        }
        self.roster.create(Vec::new());
        let familiar = self.roster.familiars.last_mut().ok_or(NOT_FOUND)?;
        if let Err(error) = super::mobile::apply_look(familiar, name, mascot, color) {
            self.roster.familiars.pop();
            return Err(error);
        }
        familiar.id = id.to_owned();
        self.save(cx);
        self.ensure_chat(id, cx);
        cx.notify();
        Ok(json!({"familiarId":id}))
    }

    pub(crate) fn external_update(
        &mut self,
        id: &str,
        name: Option<&str>,
        mascot: Option<&str>,
        color: Option<&str>,
        cx: &mut Context<Self>,
    ) -> Result<Value, String> {
        let familiar = self.roster.get_mut(id).ok_or(NOT_FOUND)?;
        super::mobile::apply_look(familiar, name, mascot, color)?;
        self.configure_chat(id, cx);
        self.save(cx);
        cx.notify();
        Ok(json!({"familiarId":id}))
    }

    pub(crate) fn wait_for_external_write(
        &mut self,
        cx: &mut Context<Self>,
    ) -> Task<Result<(), String>> {
        let Some(previous) = self.writes.take() else {
            return Task::ready(Ok(()));
        };
        let (sender, receiver) = async_channel::bounded(1);
        self.writes = Some(cx.spawn(async move |_, _| {
            let result = previous.await;
            let _ = sender.try_send(result.clone());
            result
        }));
        cx.spawn(async move |_, _| {
            receiver
                .recv()
                .await
                .map_err(|_| "Familiar changes could not be saved.".to_owned())?
        })
    }
}
