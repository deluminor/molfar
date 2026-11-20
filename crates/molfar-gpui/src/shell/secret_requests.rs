use super::*;
use crate::conversation::secret_request::{Answer, SecretRequestCard};
use molfar_core::{
    familiar::bridge::Call,
    secrets::{
        Error, Scope, SecretStore, Status,
        request::{self, RequestStatus, SecretRequest},
    },
};
use serde_json::json;
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};

pub(super) struct OpenRequest {
    call: Call,
    pub(super) card: Option<Entity<SecretRequestCard>>,
    subscription: Option<Subscription>,
    cancelled: Arc<AtomicBool>,
}

impl Shell {
    pub(super) fn reattach_secret_request(&mut self, call: &Call) -> bool {
        if call.action != request::REQUEST {
            return false;
        }
        let Some(open) = self.open_secret_requests.get_mut(&call.session) else {
            return false;
        };

        if open.call.request_id != call.request_id {
            let _ = call.reply.send(Err(
                "This session already has an open secret request.".into()
            ));
        } else if open.call.input != call.input {
            let _ = call.reply.send(Err(
                "Request ID was already used with different input".into()
            ));
        } else {
            open.call.reply = call.reply.clone();
        }
        true
    }

    pub(super) fn dispatch_secret_call(&mut self, call: Call, cx: &mut Context<Self>) {
        let id = call.session;
        let caller = self.sessions[&id].read(cx);
        let was_busy = caller.busy;
        if caller.summary.archived {
            self.finish_app_call(call, Err("This session is archived.".into()), cx);
            return;
        }

        let path = caller.summary.cwd.clone();
        let label = self.project_label(&path);
        let database = self.store.clone();
        let store = self.secret_store.clone();
        if call.action == request::LIST {
            let result = cx.background_executor().spawn(async move {
                let db = locked(&database)?;
                let project = own_scope(&store, &db, &path, None)?;
                let entries = store.list(&db).map_err(|error| error.to_string())?;
                Ok(json!(entries.into_iter()
                    .filter(|entry| entry.scope == Scope::Global || project.as_ref() == Some(&entry.scope))
                    .map(|entry| json!({"name": entry.name.as_str(), "scope": entry.scope.to_string(),
                        "createdAt": entry.created_at}))
                    .collect::<Vec<_>>()))
            });
            cx.spawn(async move |this, cx| {
                let result = result.await;
                let _ = this.update(cx, |this, cx| this.finish_app_call(call, result, cx));
            })
            .detach();
            return;
        }

        let (name, reason) = match request::parse_request(&call.input) {
            Ok(parsed) => parsed,
            Err(error) => {
                self.finish_app_call(call, Err(error), cx);
                return;
            }
        };
        let request_id = call.request_id.clone();
        let agent = caller.mobile_model().map_or_else(
            || Kind::from_id(&caller.summary.provider).label().to_owned(),
            |model| {
                format!(
                    "{} · {model}",
                    Kind::from_id(&caller.summary.provider).label()
                )
            },
        );
        let title = self.session_metadata(id, cx).display_title();
        if self.reattach_secret_request(&call) {
            self.app_pending.remove(&(id, request_id));
            return;
        }

        self.open_secret_requests.insert(
            id,
            OpenRequest {
                call,
                card: None,
                subscription: None,
                cancelled: Arc::new(AtomicBool::new(false)),
            },
        );
        let scope_label = label.clone();
        let pending_id = request_id.clone();
        let result = cx.background_executor().spawn(async move {
            if store.probe().is_err() {
                return Ok(Err(Status::Unavailable));
            }
            let db = locked(&database)?;
            let scope =
                own_scope(&store, &db, &path, Some(&label))?.ok_or("Secret scope unavailable.")?;
            let entries = store.list(&db).map_err(|error| error.to_string())?;
            if entries
                .iter()
                .any(|entry| entry.scope == scope && entry.name == name)
            {
                return Ok(Err(Status::Exists));
            }
            let redactor = store
                .redactor(&db, Some(scope.clone()))
                .map_err(|error| error.to_string())?;
            Ok::<_, String>(Ok(SecretRequest {
                request_id,
                session: id,
                agent: redactor.text(&agent),
                name,
                scope,
                reason: redactor.text(&reason),
                status: RequestStatus::Open,
                time: molfar_core::time::now_ms(),
            }))
        });
        cx.spawn(async move |this, cx| {
            let result = result.await;
            let _ = this.update(cx, |this, cx| {
                if this
                    .open_secret_requests
                    .get(&id)
                    .is_none_or(|open| open.call.request_id != pending_id)
                {
                    return;
                }

                match result {
                    Ok(Ok(request)) => {
                        let eligible = this.sessions.get(&id).is_some_and(|view| {
                            let view = view.read(cx);
                            !view.summary.archived && (!was_busy || view.busy)
                        });
                        if eligible {
                            this.show_secret_request(request, title, scope_label, cx);
                        } else {
                            this.finish_secret_request(id, Ok(Status::Cancelled), cx);
                        }
                    }
                    Ok(Err(status)) => this.finish_secret_request(id, Ok(status), cx),
                    Err(error) => this.finish_secret_request(id, Err(error), cx),
                }
            });
        })
        .detach();
    }

    fn show_secret_request(
        &mut self,
        request: SecretRequest,
        title: String,
        label: String,
        cx: &mut Context<Self>,
    ) {
        let id = request.session;
        let Some(open) = self
            .open_secret_requests
            .get_mut(&id)
            .filter(|open| open.call.request_id == request.request_id)
        else {
            return;
        };
        if let Err(error) = locked(&self.store)
            .and_then(|db| request.persist(&db).map_err(|error| error.to_string()))
        {
            self.finish_secret_request(id, Err(error), cx);
            return;
        }

        let card = cx.new(|cx| SecretRequestCard::new(request, title, label, cx));
        open.subscription = Some(
            cx.subscribe(&card, move |this, _, answer, cx| match answer {
                Answer::Save => this.submit_secret(id, cx),
                Answer::Cancel => this.cancel_secret_request(id, cx),
            }),
        );
        open.card = Some(card.clone());
        self.sessions[&id].update(cx, |view, cx| view.set_secret_card(Some(card), cx));
    }
}

pub(super) fn own_scope(
    store: &SecretStore,
    db: &molfar_core::store::Store,
    path: &str,
    label: Option<&str>,
) -> Result<Option<Scope>, String> {
    match store.project_scope(db, std::path::Path::new(path), label) {
        Ok(scope) => Ok(Some(scope)),
        Err(Error::Missing) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

pub(super) fn project_redactor(
    store: &SecretStore,
    db: &molfar_core::store::Store,
    path: &str,
) -> Result<molfar_core::secrets::Redactor, String> {
    let scope = own_scope(store, db, path, None)?;
    store.redactor(db, scope).map_err(|error| error.to_string())
}

mod lifecycle;
