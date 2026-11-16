use super::*;

impl Shell {
    pub(super) fn companion_existing_view(
        &self,
        id: i64,
        cx: &App,
    ) -> Option<Entity<Conversation>> {
        if let Some(manager) = &self.familiars {
            let manager = manager.read(cx);
            if let Some(familiar) = manager
                .roster
                .familiars
                .iter()
                .find(|familiar| familiar.session_id == Some(id))
            {
                return manager.open_chat(&familiar.id);
            }
        }
        self.sessions.get(&id).cloned()
    }

    pub(super) fn companion_view(
        &mut self,
        input: &Value,
        cx: &mut Context<Self>,
    ) -> Result<Entity<Conversation>, String> {
        if let Some(familiar) = input.get("familiarId").and_then(Value::as_str) {
            return self
                .familiars
                .as_ref()
                .and_then(|familiars| {
                    familiars.update(cx, |familiars, cx| familiars.mobile_chat(familiar, cx))
                })
                .ok_or("Familiar not found".into());
        }
        let id = session_id(input)?;
        let familiar = self.familiars.as_ref().and_then(|manager| {
            manager
                .read(cx)
                .roster
                .familiars
                .iter()
                .find(|familiar| familiar.session_id == Some(id))
                .map(|familiar| familiar.id.clone())
        });
        if let Some(familiar) = familiar {
            return self
                .familiars
                .as_ref()
                .and_then(|manager| {
                    manager.update(cx, |manager, cx| manager.mobile_chat(&familiar, cx))
                })
                .ok_or("Familiar conversation is unavailable".into());
        }
        self.ensure_session(id, cx)
            .ok_or("Session not found".into())
    }

    pub(super) fn companion_approval(
        &mut self,
        input: &Value,
        cx: &mut Context<Self>,
    ) -> Result<Value, String> {
        let request = input["requestId"]
            .as_u64()
            .ok_or("This approval was already answered")?;
        let decision = match input["decision"].as_str() {
            Some("allow") => Decision::Allow,
            Some("deny") => Decision::Deny,
            _ => return Err("decision must be allow or deny".into()),
        };
        let view = self.companion_view(input, cx)?;
        let id = view
            .read(cx)
            .mobile_pending(cx)
            .into_iter()
            .find(|pending| {
                request_number(&pending.id) == request || pending.id == request.to_string()
            })
            .map(|pending| pending.id)
            .ok_or("This approval was already answered")?;
        let answered = view.update(cx, |view, cx| {
            view.decide_notification_request(&id, decision, cx)
        });
        if !answered {
            return Err("This approval was already answered".into());
        }
        Ok(json!({"answered": true}))
    }

    pub(super) fn companion_question(
        &mut self,
        input: &Value,
        cx: &mut Context<Self>,
    ) -> Result<Value, String> {
        let request = input["requestId"]
            .as_u64()
            .ok_or("This question was already answered")?;
        let view = self.companion_view(input, cx)?;
        view.update(cx, |view, cx| {
            view.mobile_answer_question(request, input.get("reply"), cx)
        })?;
        Ok(json!({"answered": true}))
    }
}
