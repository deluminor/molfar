use super::*;
use tools::sessions::{ARCHIVE, DELETE, UPDATE};

impl Shell {
    pub(super) fn external_session_manage(
        &mut self,
        scope: &Scope,
        tool: &str,
        arguments: &Value,
        done: Done,
        cx: &mut Context<Self>,
    ) {
        let id = match self.external_target(scope, &arguments["sessionId"], true, cx) {
            Ok(id) => id,
            Err(error) => {
                let _ = done.try_send(Err(error));
                return;
            }
        };
        if tool == DELETE {
            self.external_delete_session(id, done, cx);
            return;
        }
        let work = if tool == UPDATE {
            let Some(title) = arguments["title"].as_str() else {
                let _ = done.try_send(Err("Provide a session title.".into()));
                return;
            };
            self.rename_session(id, title.trim().to_owned(), cx)
        } else {
            self.set_session_archived(id, tool == ARCHIVE, cx)
        };
        cx.spawn(async move |_, _| {
            let _ = done
                .send(work.await.map(|()| json!({"sessionId":id})))
                .await;
        })
        .detach();
    }

    fn external_delete_session(&mut self, id: i64, done: Done, cx: &mut Context<Self>) {
        let shell = cx.entity();
        cx.defer(move |cx| {
            let failed = done.clone();
            let update = cx.with_window(shell.entity_id(), |window, cx| {
                shell.update(cx, |this, cx| {
                    if this.deleting.contains(&id) {
                        let _ = done.try_send(Err("Session deletion is already running.".into()));
                        return;
                    }
                    this.delete_session(id, window, cx);
                    if !this.deleting.contains(&id) {
                        let error = this
                            .error
                            .clone()
                            .unwrap_or_else(|| "Could not delete session.".into());
                        let _ = done.try_send(Err(error));
                        return;
                    }
                    let deleting = this.group_writes.take();
                    let store = this.store.clone();
                    this.group_writes = Some(cx.spawn(async move |_, cx| {
                        if let Some(deleting) = deleting {
                            deleting.await;
                        }
                        let result = cx
                            .background_executor()
                            .spawn(async move {
                                if locked(&store)?
                                    .sessions()?
                                    .iter()
                                    .any(|session| session.id == id)
                                {
                                    return Err(
                                        "Could not delete session; its data was preserved.".into(),
                                    );
                                }
                                Ok(json!({"sessionId":id,"deleted":true}))
                            })
                            .await;
                        let _ = done.send(result).await;
                    }));
                })
            });
            if update.is_none() {
                let _ = failed.try_send(Err("MOLFAR window is unavailable.".into()));
            }
        });
    }
}
