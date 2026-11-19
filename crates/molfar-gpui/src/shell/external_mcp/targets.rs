use super::*;

impl Shell {
    /// One uniform error for missing and out-of-scope sessions.
    pub(super) fn external_target(
        &self,
        scope: &Scope,
        value: &Value,
        manage: bool,
        cx: &App,
    ) -> Result<i64, String> {
        let missing = || "Session not found.".to_owned();
        let id = match value {
            Value::String(id) => locked(&self.store)?
                .resolve_session_id(id)
                .map_err(|_| missing())?,
            value => value.as_i64().ok_or_else(missing)?,
        };
        if !self.external_reachable(id, &scope.projects, cx) {
            return Err(missing());
        }
        if manage && locked(&self.store)?.session_task_card(id)?.is_some() {
            return Err("Board stage sessions are controlled from the Board.".into());
        }

        Ok(id)
    }

    /// The project a mutation targets, checked against current grants with the
    /// same uniform errors a fresh call returns.
    pub(super) fn external_mutation_target(
        &self,
        scope: &Scope,
        tool: &str,
        arguments: &Value,
        cx: &App,
    ) -> Result<ReceiptTarget, String> {
        let project = self.external_mutation_project(scope, tool, arguments, cx)?;
        Ok(ReceiptTarget::Project(molfar_core::files::path_key(
            &project,
        )))
    }

    fn external_mutation_project(
        &self,
        scope: &Scope,
        tool: &str,
        arguments: &Value,
        cx: &App,
    ) -> Result<String, String> {
        if let Some(project) = arguments["project"].as_str() {
            return scope.project(project);
        }
        if let Some(card_id) = arguments["cardId"].as_str() {
            return locked(&self.store)?
                .board_scoped_card(card_id, &scope.projects)
                .map(|card| card.project_cwd);
        }
        if matches!(tool, notes_api::WRITE | notes_api::DELETE) {
            let id = arguments["id"].as_str().ok_or("Provide a note ID.")?;
            return notes_api::target_project(&*locked(&self.store)?, id, &scope.projects);
        }
        let id = self.external_target(scope, &arguments["sessionId"], true, cx)?;
        Ok(self.session_metadata(id, cx).summary.cwd.clone())
    }

    pub(super) fn external_deleted_replay(
        &self,
        scope: &Scope,
        tool: &str,
        arguments: &Value,
        request: &str,
        digest: &str,
    ) -> Option<Result<Value, String>> {
        if !matches!(tool, tools::sessions::DELETE | notes_api::DELETE) {
            return None;
        }
        let lookup = || {
            let store = locked(&self.store)?;
            let exists = if tool == notes_api::DELETE {
                notes_api::exists(
                    &store,
                    arguments["id"].as_str().ok_or("Provide a note ID.")?,
                )?
            } else {
                let id = &arguments["sessionId"];
                let sessions = store.sessions()?;
                let handle = id
                    .as_i64()
                    .or_else(|| id.as_str().and_then(|id| store.resolve_session_id(id).ok()));
                handle.is_some_and(|handle| sessions.iter().any(|session| session.id == handle))
            };
            if exists {
                return Ok(None);
            }
            store.external_receipt_find(
                &scope.principal.client_id,
                tool,
                request,
                &scope.projects,
                digest,
            )
        };
        match lookup() {
            Ok(Some(BEGIN::Replay(result))) => Some(result),
            Ok(Some(BEGIN::Pending)) => {
                Some(Err("Deletion outcome is pending for this requestId.".into()))
            }
            Ok(Some(BEGIN::Conflict)) => Some(Err(
                "requestId was already used with different input.".into(),
            )),
            Err(error) => Some(Err(format!("Cannot read deletion receipt: {error}"))),
            _ => None,
        }
    }

    pub(super) fn external_reachable(&self, id: i64, projects: &[String], cx: &App) -> bool {
        let Some(summary) = self
            .sessions
            .get(&id)
            .map(|view| &view.read(cx).summary)
            .or_else(|| self.session_summaries.get(&id))
        else {
            return false;
        };
        projects.iter().any(|project| {
            molfar_core::files::path_key(project) == molfar_core::files::path_key(&summary.cwd)
        }) && !self.orchestration_worker(id)
            && !self.familiars.as_ref().is_some_and(|familiars| {
                let familiars = familiars.read(cx);
                familiars.is_familiar_session(id) || familiars.hidden_session(id)
            })
    }

    pub(super) fn external_session_status(&self, id: i64, cx: &App) -> &'static str {
        let Some(view) = self.sessions.get(&id).map(|view| view.read(cx)) else {
            return if self.session_metadata(id, cx).busy {
                "running"
            } else {
                "idle"
            };
        };
        if view.needs_approval() {
            return "needs-input";
        }
        if view.external_submission_pending() {
            return "running";
        }
        if view.notification_was_cancelled() {
            return "cancelled";
        }
        if !view.summary.has_messages {
            return "idle";
        }
        if view.external_outcome(cx).0 {
            "completed"
        } else {
            "failed"
        }
    }
}
