use super::*;
use gpui::Task;

impl Shell {
    pub(super) fn rename_session(
        &mut self,
        id: i64,
        name: String,
        cx: &mut Context<Self>,
    ) -> Task<Result<(), String>> {
        if !self.session_summaries.contains_key(&id) {
            return Task::ready(Err("Session not found.".into()));
        }

        let (done, result) = async_channel::bounded(1);
        let store = self.store.clone();
        let previous = self.group_writes.take();
        self.group_writes = Some(cx.spawn(async move |this, cx| {
            if let Some(previous) = previous {
                previous.await;
            }
            let title = name.clone();
            let work = cx
                .background_executor()
                .spawn(async move { locked(&store)?.title(id, &title) });
            let saved = work.await;
            let updated = this.update(cx, |this, cx| {
                match &saved {
                    Ok(()) => {
                        if let Some(summary) = this.session_summaries.get_mut(&id) {
                            summary.title = name.clone();
                        }
                        if let Some(session) = this.sessions.get(&id) {
                            session.update(cx, |session, cx| session.rename(name, cx));
                        }
                        this.invalidate_chrome(cx);
                    }
                    Err(error) => {
                        this.error = Some(format!("Could not rename the session: {error}"));
                    }
                }
                cx.notify();
            });
            let _ = done.try_send(saved.and_then(|()| updated.map_err(|error| error.to_string())));
        }));
        cx.spawn(async move |_, _| {
            result
                .recv()
                .await
                .map_err(|_| "Could not save the session title.".to_owned())?
        })
    }

    pub(super) fn toggle_archive(&mut self, id: i64, cx: &mut Context<Self>) {
        let archived = !self.session_metadata(id, cx).summary.archived;
        self.set_session_archived(id, archived, cx).detach();
    }

    pub(super) fn set_session_archived(
        &mut self,
        id: i64,
        archived: bool,
        cx: &mut Context<Self>,
    ) -> Task<Result<(), String>> {
        if self.archiving.contains(&id) {
            return Task::ready(Err("Session archive update is already running.".into()));
        }
        if self.session_metadata(id, cx).summary.archived == archived {
            return Task::ready(Ok(()));
        }
        self.archiving.insert(id);
        self.close_preview(cx);
        self.invalidate_chrome(cx);

        let store = self.store.clone();
        let work = cx
            .background_executor()
            .spawn(async move { locked(&store)?.set_archived(id, archived) });
        cx.spawn(async move |this, cx| {
            let result = work.await;
            let close_tab = this
                .update(cx, |this, cx| {
                    this.archiving.remove(&id);
                    match &result {
                        Ok(()) => {
                            if archived {
                                this.app_runs.stop(id);
                                this.cancel_secret_request(id, cx);
                            }
                            if let Some(summary) = this.session_summaries.get_mut(&id) {
                                summary.archived = archived;
                            }
                            if let Some(view) = this.sessions.get(&id) {
                                view.update(cx, |session, cx| {
                                    session.summary.archived = archived;
                                    if archived {
                                        session.stop_if_busy(cx);
                                    }
                                });
                            }
                            this.refresh_session_mark(id, cx);
                        }
                        Err(error) => {
                            this.error = Some(format!("Could not update archive: {error}"))
                        }
                    }
                    this.invalidate_chrome(cx);
                    cx.notify();
                    result.is_ok() && archived && this.workspace.tab_of(id).is_some()
                })
                .map_err(|error| error.to_string())?;
            if close_tab {
                this.update_in(cx, |shell, window, cx| shell.close_pane(id, window, cx))
                    .map_err(|error| error.to_string())?;
            }
            result
        })
    }
}
