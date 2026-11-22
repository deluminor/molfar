use super::*;

impl Shell {
    pub(super) fn submit_secret(&mut self, id: i64, cx: &mut Context<Self>) {
        let Some(open) = self.open_secret_requests.get(&id) else {
            return;
        };
        let database = self.store.clone();
        let store = self.secret_store.clone();
        let Some((card, request, value)) = open.take_for_save(cx) else {
            return;
        };
        let cancelled = open.cancelled.clone();
        let cancellation = cancelled.clone();
        let work = cx.background_executor().spawn(async move {
            let db = locked(&database)?;
            if cancellation.load(Ordering::Acquire) {
                return Ok(Status::Cancelled);
            }
            store
                .create(&db, request.scope, request.name, value)
                .map_err(|error| error.to_string())
        });
        cx.spawn(async move |this, cx| {
            let result = work.await;
            let _ = this.update(cx, |this, cx| match result {
                Ok(status) => this.finish_secret_request(id, Ok(status), cx),
                Err(_) if cancelled.load(Ordering::Acquire) => {
                    this.finish_secret_request(id, Ok(Status::Cancelled), cx)
                }
                Err(error) => card.update(cx, |card, cx| card.save_failed(&error, cx)),
            });
        })
        .detach();
    }

    pub(in crate::shell) fn cancel_secret_request(&mut self, id: i64, cx: &mut Context<Self>) {
        let Some(open) = self.open_secret_requests.get(&id) else {
            return;
        };
        open.cancelled.store(true, Ordering::Release);
        if open.card.as_ref().is_some_and(|card| card.read(cx).saving) {
            return;
        }
        self.finish_secret_request(id, Ok(Status::Cancelled), cx);
    }

    pub(super) fn finish_secret_request(
        &mut self,
        id: i64,
        result: Result<Status, String>,
        cx: &mut Context<Self>,
    ) {
        let Some(open) = self.open_secret_requests.remove(&id) else {
            return;
        };
        if result == Ok(Status::Saved)
            && let Some(settings) = &self.settings
        {
            settings.update(cx, |settings, cx| settings.refresh_secrets(cx));
        }
        let result = result.and_then(|status| {
            if let Some(card) = open.card {
                let mut request = card.read(cx).request.clone();
                card.update(cx, |card, cx| card.clear(cx));
                request.status = status.into();
                if !self.deleting.contains(&id) && self.session_summaries.contains_key(&id) {
                    request
                        .persist(&*locked(&self.store)?)
                        .map_err(|error| error.to_string())?;
                }
            }
            Ok(json!({"status":status}))
        });
        if let Some(view) = self.sessions.get(&id) {
            view.update(cx, |view, cx| view.set_secret_card(None, cx));
        }
        self.finish_app_call(open.call, result, cx);
    }
}

impl OpenRequest {
    pub(crate) fn take_for_save<T: 'static>(
        &self,
        cx: &mut Context<T>,
    ) -> Option<(
        Entity<SecretRequestCard>,
        SecretRequest,
        molfar_core::secrets::SecretValue,
    )> {
        let card = self.card.clone()?;
        let request = card.read(cx).request.clone();
        let value = card.update(cx, |card, cx| {
            if card.saving {
                return None;
            }
            match card.take_secret(cx) {
                Ok(value) => {
                    card.error = None;
                    card.set_saving(true, cx);
                    Some(value)
                }
                Err(error) => {
                    card.error = Some(error.to_string());
                    cx.notify();
                    None
                }
            }
        })?;
        Some((card, request, value))
    }
}
