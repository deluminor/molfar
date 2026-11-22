use super::*;
use crate::{
    conversation::secret_request::{Answer, SecretRequestCard},
    shell::secret_requests::OpenRequest,
};
use molfar_core::{
    familiar::bridge::Call,
    secrets::{
        Scope, Status,
        request::{self, RequestStatus, SecretRequest},
    },
};
use std::sync::atomic::Ordering;

impl Familiars {
    pub(super) fn secret_chat(&self, session: i64, cx: &App) -> Option<Entity<Conversation>> {
        self.chats
            .values()
            .chain(self.running.values().map(|run| &run.view))
            .find(|view| view.read(cx).summary.id == session)
            .cloned()
    }

    pub(super) fn reattach_secret(&mut self, call: &Call) -> bool {
        if call.action == request::REQUEST
            && let Some(open) = self.secret_requests.get_mut(&call.session)
        {
            open.reattach(call);
            return true;
        }
        false
    }

    pub(super) fn dispatch_secret(
        &mut self,
        call: Call,
        familiar: Familiar,
        cx: &mut Context<Self>,
    ) {
        let scope = Scope::Familiar(familiar.id.clone());
        let store = self.secret_store.clone();
        let db = self.store.clone();
        let session = call.session;
        if call.action == request::LIST {
            self.app_pending.remove(&(session, call.request_id.clone()));
            let work = cx.background_executor().spawn(async move {
                let db = locked(&db)?;
                request::list(&store, &db, Some(scope))
            });
            cx.spawn(async move |_, _| {
                let _ = call.reply.send(work.await);
            })
            .detach();
            return;
        }

        let (name, reason) = match request::parse_request(&call.input) {
            Ok(input) => input,
            Err(error) => return self.finish_call(call, Err(error), cx),
        };
        if self.reattach_secret(&call) {
            self.app_pending.remove(&(session, call.request_id.clone()));
            return;
        }
        let Some(view) = self.secret_chat(session, cx) else {
            return self.finish_call(call, Err("Familiar session unavailable.".into()), cx);
        };
        let was_busy = view.read(cx).busy;
        let ephemeral = view.read(cx).turn_secret_answers.clone();
        let label = format!("Familiar {}", familiar.label());
        let request = SecretRequest {
            request_id: call.request_id.clone(),
            session,
            agent: view.read(cx).familiar_model_label().to_string(),
            name,
            scope,
            reason,
            status: RequestStatus::Open,
            time: molfar_core::time::now_ms(),
        };
        let id = request.request_id.clone();
        self.secret_requests.insert(session, OpenRequest::new(call));
        let work = cx.background_executor().spawn(async move {
            let db = locked(&db)?;
            request.prepare(&store, &db, ephemeral)
        });
        cx.spawn(async move |this, cx| {
            let result = work.await;
            let _ = this.update(cx, |this, cx| {
                if this
                    .secret_requests
                    .get(&session)
                    .is_none_or(|open| open.call.request_id != id)
                {
                    return;
                }
                match result {
                    Ok(Ok(request)) if !was_busy || view.read(cx).busy => {
                        this.show_secret(session, request, label, view, cx)
                    }
                    Ok(Ok(_)) => this.finish_secret(session, Ok(Status::Cancelled), cx),
                    Ok(Err(status)) => this.finish_secret(session, Ok(status), cx),
                    Err(error) => this.finish_secret(session, Err(error), cx),
                }
            });
        })
        .detach();
    }

    fn show_secret(
        &mut self,
        session: i64,
        request: SecretRequest,
        label: String,
        view: Entity<Conversation>,
        cx: &mut Context<Self>,
    ) {
        let result = locked(&self.store)
            .and_then(|db| request.persist(&db).map_err(|error| error.to_string()));
        if let Err(error) = result {
            return self.finish_secret(session, Err(error), cx);
        }

        let title = view.read(cx).summary.title.clone();
        let focus = self.settings.is_none() && self.chat().as_ref() == Some(&view);
        let card = cx.new(|cx| {
            let mut card = SecretRequestCard::new(request, title, label, cx);
            if focus {
                card.focus_on_mount();
            }
            card
        });
        let subscription = cx.subscribe(&card, move |this, _, answer, cx| match answer {
            Answer::Save => this.save_secret(session, cx),
            Answer::Cancel => this.cancel_secret(session, cx),
        });
        if let Some(open) = self.secret_requests.get_mut(&session) {
            open.subscription = Some(subscription);
            open.card = Some(card.clone());
        }
        view.update(cx, |view, cx| view.set_secret_card(Some(card), cx));
    }

    fn save_secret(&mut self, session: i64, cx: &mut Context<Self>) {
        let Some(open) = self.secret_requests.get(&session) else {
            return;
        };
        let Some((card, request, value)) = open.take_for_save(cx) else {
            return;
        };
        let cancelled = open.cancelled.clone();
        let cancellation = cancelled.clone();
        let db = self.store.clone();
        let store = self.secret_store.clone();
        let work = cx.background_executor().spawn(async move {
            let db = locked(&db)?;
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
                Ok(status) => this.finish_secret(session, Ok(status), cx),
                Err(_) if cancelled.load(Ordering::Acquire) => {
                    this.finish_secret(session, Ok(Status::Cancelled), cx)
                }
                Err(error) => card.update(cx, |card, cx| card.save_failed(&error, cx)),
            });
        })
        .detach();
    }

    pub(super) fn cancel_secret(&mut self, session: i64, cx: &mut Context<Self>) {
        let Some(open) = self.secret_requests.get(&session) else {
            return;
        };
        open.cancelled.store(true, Ordering::Release);
        if !open.card.as_ref().is_some_and(|card| card.read(cx).saving) {
            self.finish_secret(session, Ok(Status::Cancelled), cx);
        }
    }

    fn finish_secret(
        &mut self,
        session: i64,
        result: Result<Status, String>,
        cx: &mut Context<Self>,
    ) {
        let Some(open) = self.secret_requests.remove(&session) else {
            return;
        };
        let result = result.and_then(|status| {
            if let Some(card) = open.card {
                let mut request = card.read(cx).request.clone();
                card.update(cx, |card, cx| card.clear(cx));
                request.status = status.into();
                request
                    .persist(&*locked(&self.store)?)
                    .map_err(|error| error.to_string())?;
            }
            Ok(serde_json::json!({"status":status}))
        });
        if let Some(view) = self.secret_chat(session, cx) {
            view.update(cx, |view, cx| view.set_secret_card(None, cx));
        }
        self.finish_call(open.call, result, cx);
        self.changed(cx);
    }
}
