use super::*;

impl Shell {
    pub(super) fn companion_transcript(
        &mut self,
        target: Target,
        input: &Value,
        cx: &mut Context<Self>,
    ) -> Result<Value, String> {
        let (id, title, provider) = match &target {
            Target::Session(id) => {
                let summary = self.session_summaries.get(id).ok_or("Session not found")?;
                (*id, summary.title.clone(), summary.provider.clone())
            }
            Target::Familiar(familiar) => {
                let session = self
                    .familiars
                    .as_ref()
                    .and_then(|familiars| {
                        familiars
                            .read(cx)
                            .roster
                            .familiars
                            .iter()
                            .find(|item| item.id == *familiar)
                            .and_then(|item| item.session_id)
                    })
                    .ok_or("Familiar not found")?;
                let summary = self
                    .companion_existing_view(session, cx)
                    .map(|view| view.read(cx).summary.clone())
                    .or_else(|| self.session_summaries.get(&session).cloned());
                let summary = match summary {
                    Some(summary) => summary,
                    None => locked(&self.store)?
                        .sessions()?
                        .into_iter()
                        .find(|summary| summary.id == session)
                        .ok_or("This Familiar's conversation is unavailable")?,
                };
                (session, summary.title, summary.provider)
            }
        };
        let view = self.companion_existing_view(id, cx);
        let saved = locked(&self.store)?.agent_settings(id)?.unwrap_or_default();
        let busy = view.as_ref().is_some_and(|view| view.read(cx).busy);
        let mode = view
            .as_ref()
            .map(|view| view.read(cx).settings.access)
            .unwrap_or(saved.access)
            .id();
        let model = view
            .as_ref()
            .and_then(|view| view.read(cx).mobile_model().map(str::to_owned))
            .or(saved.model)
            .unwrap_or_default();
        let mut blocks = match view.as_ref().filter(|view| view.read(cx).history_loaded()) {
            Some(view) => locked(&self.store)?.conversation_blocks_with_rows(
                id,
                view.read(cx).transcript.read(cx).source_rows(),
            )?,
            None => locked(&self.store)?.conversation_blocks(id)?,
        };
        blocks = blocks.into_iter().filter_map(block).collect();
        let pending = view
            .as_ref()
            .map(|view| view.read(cx).mobile_pending(cx))
            .unwrap_or_default();
        let needs_approval = !pending.is_empty();
        for pending in pending {
            blocks.push(json!({"id": format!("approval-{}",pending.id),"role":"approval","text":pending.label,"approval":{"requestId":request_number(&pending.id)}}));
        }
        let limit = input["limit"].as_u64().unwrap_or(80).clamp(1, 200) as usize;
        let truncated = blocks.len() > limit || locked(&self.store)?.history_before(id)?.is_some();
        if blocks.len() > limit {
            blocks = blocks.split_off(blocks.len() - limit);
        }
        let question = view
            .as_ref()
            .map(|view| view.read(cx).mobile_question(cx))
            .filter(|value| !value.is_null());
        let status = if question.is_some() || needs_approval {
            "needs-you"
        } else if busy {
            "working"
        } else {
            "idle"
        };
        let mut body = json!({
            "sessionId": id.to_string(),
            "title": title,
            "busy": busy,
            "status": status,
            "harness": provider,
            "model": model,
            "runtimeMode": mode,
            "blocks": blocks,
            "truncated": truncated,
        });
        if let Some(question) = question {
            body["question"] = question;
        }
        let revision = sha256(&body.to_string());
        if input["ifRevision"].as_str() == Some(revision.as_str()) {
            return Ok(json!({"unchanged": true, "revision": revision}));
        }
        body["revision"] = json!(revision);
        Ok(body)
    }
}
