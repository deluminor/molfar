use super::*;
use molfar_core::secrets::request::RequestStatus;

pub(crate) fn outcome_text(request: &SecretRequest) -> String {
    let status = match request.status {
        RequestStatus::Saved => "saved",
        RequestStatus::Cancelled => "cancelled",
        RequestStatus::Expired => "expired",
        status => status.label(),
    };
    format!("Secret {} {status}", request.name.as_str())
}

impl Conversation {
    pub(crate) fn composer_focus(&self, cx: &App) -> gpui::FocusHandle {
        self.secret_card.as_ref().map_or_else(
            || self.input.focus_handle(cx),
            |card| card.read(cx).input.focus_handle(cx),
        )
    }

    pub(crate) fn set_secret_card(
        &mut self,
        card: Option<Entity<SecretRequestCard>>,
        cx: &mut Context<Self>,
    ) {
        self.secret_card = card;
        self.refresh_secret_notices(cx);
        cx.emit(SessionChanged);
        cx.notify();
    }

    pub(crate) fn cancel_secret_card(&mut self, cx: &mut Context<Self>) {
        if let Some(card) = &self.secret_card {
            card.update(cx, |card, cx| card.cancel(cx));
        }
    }

    pub(in crate::conversation) fn refresh_secret_notices(&mut self, cx: &mut Context<Self>) {
        self.secret_notice_generation = self.secret_notice_generation.wrapping_add(1);
        let generation = self.secret_notice_generation;
        let store = self.store.clone();
        let id = self.summary.id;
        let work = cx.background_executor().spawn(async move {
            SecretRequest::history(&*crate::runtime::locked(&store)?, id)
                .map_err(|error| error.to_string())
        });
        cx.spawn(async move |this, cx| {
            let result = work.await;
            let _ = this.update(cx, |this, cx| match result {
                Ok(history) if generation == this.secret_notice_generation => {
                    let pending = this.secret_request(cx).map(|request| request.request_id);
                    let history: Vec<_> = history
                        .into_iter()
                        .filter(|request| Some(&request.request_id) != pending.as_ref())
                        .collect();
                    this.secret_status = history.last().cloned();
                    this.transcript
                        .update(cx, |view, cx| view.set_secret_outcomes(history, cx));
                    cx.notify();
                }
                Ok(_) => {}
                Err(error) => log::warn!("Secret request history for session {id}: {error}"),
            });
        })
        .detach();
    }

    pub(in crate::conversation) fn render_secret_notice(
        &self,
        cx: &mut Context<Self>,
    ) -> Option<AnyElement> {
        if let Some(card) = self.secret_card.clone() {
            return Some(card.into_any_element());
        }
        let outcome = self.secret_status.as_ref()?;
        if self.dismissed_secret_status.as_ref() == Some(&outcome.request_id) {
            return None;
        }
        let id = outcome.request_id.clone();
        Some(
            div()
                .px(px(8.))
                .child(
                    composer_banner("secret-outcome-banner", AMBER_400)
                        .h(px(32.))
                        .role(Role::Status)
                        .child(icon("key", 14.).text_color(content(0.65)))
                        .child(div().flex_1().truncate().child(outcome_text(outcome)))
                        .child(
                            usage_button(
                                "dismiss-secret-outcome",
                                "Dismiss secret status",
                                false,
                                false,
                                false,
                            )
                            .child(icon("close", 14.))
                            .on_click(cx.listener(
                                move |this, _, _, cx| {
                                    this.dismissed_secret_status = Some(id.clone());
                                    cx.notify();
                                },
                            )),
                        ),
                )
                .into_any_element(),
        )
    }

    pub(crate) fn secret_request(&self, cx: &App) -> Option<SecretRequest> {
        self.secret_card
            .as_ref()
            .map(|entity| entity.read(cx).request.clone())
    }
}
