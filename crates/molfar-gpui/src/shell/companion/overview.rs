use super::*;

impl Shell {
    pub(super) fn companion_mode_model(
        &self,
        id: i64,
        view: Option<&Entity<Conversation>>,
        cx: &App,
    ) -> Result<(&'static str, String), String> {
        let saved = locked(&self.store)?.agent_settings(id)?.unwrap_or_default();
        let mode = view
            .map(|view| view.read(cx).settings.access)
            .unwrap_or(saved.access)
            .id();
        let model = view
            .and_then(|view| view.read(cx).mobile_model().map(str::to_owned))
            .or(saved.model)
            .unwrap_or_default();

        Ok((mode, model))
    }

    pub(super) fn companion_overview(&self, cx: &App) -> Result<Value, String> {
        let hidden = self
            .familiars
            .as_ref()
            .map(|familiars| familiars.read(cx).roster.hidden_sessions.clone())
            .unwrap_or_default();
        let mut familiars = Vec::new();
        if let Some(roster) = self.familiars.as_ref() {
            for familiar in &roster.read(cx).roster.familiars {
                let view = roster.read(cx).open_chat(&familiar.id);
                let status = if view
                    .as_ref()
                    .is_some_and(|view| view.read(cx).mobile_waiting(cx).is_some())
                {
                    "needs-you"
                } else if view.as_ref().is_some_and(|view| view.read(cx).busy) {
                    "working"
                } else {
                    "idle"
                };
                familiars.push(json!({
                    "id": familiar.id,
                    "name": familiar.label(),
                    "color": format!("#{:06x}", familiar.color & 0xff_ffff),
                    "mascot": {"name": familiar.mascot, "rest": "", "talk": ""},
                    "projects": familiar.projects.iter().map(|path| project_ref(path)).collect::<Vec<_>>(),
                    "status": status,
                    "unread": false,
                }));
            }
        }
        let mut sessions = Vec::new();
        let mut projects: HashMap<String, (u32, u32)> = HashMap::new();
        for id in &self.order {
            if hidden.contains(id) {
                continue;
            }
            if self
                .familiars
                .as_ref()
                .is_some_and(|familiars| familiars.read(cx).is_familiar_session(*id))
            {
                continue;
            }
            let Some(summary) = self.session_summaries.get(id) else {
                continue;
            };
            if summary.archived {
                continue;
            }
            let (title, busy, needs) = {
                let meta = self.session_metadata(*id, cx);
                (meta.display_title(), meta.busy, meta.needs_approval())
            };
            let status = if needs {
                "needs-you"
            } else if busy {
                "working"
            } else {
                "idle"
            };
            let counts = projects.entry(summary.cwd.clone()).or_insert((0, 0));
            if busy {
                counts.0 += 1;
            }
            if needs {
                counts.1 += 1;
            }
            let (mode, model) = self.companion_mode_model(*id, self.sessions.get(id), cx)?;
            sessions.push(json!({
                "id": id.to_string(),
                "title": title,
                "project": project_ref(&summary.cwd),
                "harness": summary.provider,
                "model": model,
                "runtimeMode": mode,
                "status": status,
                "updatedAt": summary.updated_at,
            }));
        }
        for path in &self.workspace.projects {
            projects.entry(path.clone()).or_insert((0, 0));
        }
        Ok(json!({
            "protocol": 2,
            "generatedAt": now_ms(),
            "familiars": familiars,
            "projects": projects.into_iter().map(|(path, (working, needs_you))| {
                let mut project = project_ref(&path);
                project["working"] = json!(working);
                project["needsYou"] = json!(needs_you);
                project
            }).collect::<Vec<_>>(),
            "sessions": sessions,
            "capabilities": [],
        }))
    }
}
