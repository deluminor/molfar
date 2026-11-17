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
