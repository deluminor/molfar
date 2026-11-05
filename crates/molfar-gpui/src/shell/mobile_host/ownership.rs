use super::*;

fn authorize(store: &Database, id: &str) -> Result<(), String> {
    if id.starts_with("familiar:") {
        return Ok(());
    }
    let store = locked(store)?;
    let Some(session) = store.resolve_existing_session_id(id) else {
        return Err("Session is no longer available".into());
    };
    if store.session_task_card(session)?.is_some() {
        return Err("Task Board sessions are not available over phone access.".into());
    }
    Ok(())
}

impl Shell {
    pub(super) fn authorize_mobile_request(
        &mut self,
        request: Request,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let Some(id) =
            string(&request.params, "conversationId").filter(|id| !id.starts_with("familiar:"))
        else {
            self.handle_mobile_request_ready(request, window, cx);
            return;
        };
        let store = self.store.clone();
        let work = cx
            .background_executor()
            .spawn(async move { authorize(&store, &id) });
        cx.spawn(async move |this, cx| {
            let result = work.await;
            match result {
                Ok(()) => {
                    let _ = this.update_in(cx, |this, window, cx| {
                        this.handle_mobile_request_ready(request, window, cx)
                    });
                }
                Err(error) => request.reply(Err(error)),
            }
        })
        .detach();
    }

    pub(super) fn authorize_mobile_watch(&mut self, start: WatchStart, cx: &mut Context<Self>) {
        let store = self.store.clone();
        let id = start.conversation_id.clone();
        let work = cx
            .background_executor()
            .spawn(async move { authorize(&store, &id) });
        cx.spawn(async move |this, cx| match work.await {
            Ok(()) => {
                let _ = this.update(cx, |this, cx| this.start_mobile_watch_ready(start, cx));
            }
            Err(error) => start.accept(Err(error)),
        })
        .detach();
    }
}

#[cfg(test)]
mod tests {
    use super::authorize;
    use molfar_core::store::Store;
    use std::sync::{Arc, Mutex};

    #[test]
    fn phone_access_denies_board_owned_sessions_by_direct_id() {
        let directory = std::env::temp_dir().join(format!(
            "molfar-phone-ownership-{}",
            molfar_core::familiar::new_id()
        ));
        std::fs::create_dir_all(&directory).unwrap();
        let path = directory.join("molfar.db");
        let store = Store::open_desktop(&path).unwrap();
        let owned = store.create("codex", "/project").unwrap();
        let ordinary = store.create("codex", "/project").unwrap();
        let owned_id = store.persisted_session_id(owned.id).unwrap();
        let ordinary_id = store.persisted_session_id(ordinary.id).unwrap();
        rusqlite::Connection::open(&path)
            .unwrap()
            .execute(
                "UPDATE sessions SET task_card_id='card' WHERE id=?1",
                [&owned_id],
            )
            .unwrap();
        let store = Arc::new(Mutex::new(store));

        let denied = authorize(&store, &owned_id).unwrap_err();

        assert!(denied.contains("Task Board"), "{denied}");
        assert!(authorize(&store, &ordinary_id).is_ok());
        assert!(authorize(&store, "missing-session").is_err());
        assert!(authorize(&store, "familiar:any").is_ok());
        drop(store);
        std::fs::remove_dir_all(directory).unwrap();
    }
}
