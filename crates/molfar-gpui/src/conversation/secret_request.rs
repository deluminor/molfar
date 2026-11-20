use super::*;
use crate::input::Input;
use crate::settings::widgets::{primary_button, secondary_button};
use gpui::App;
use molfar_core::secrets::{SecretValue, request::SecretRequest};

#[derive(Clone, Copy)]
pub(crate) enum Answer {
    Save,
    Cancel,
}

pub(crate) struct SecretRequestCard {
    pub(crate) request: SecretRequest,
    title: String,
    scope_label: String,
    input: Entity<Input>,
    pub(crate) saving: bool,
    pub(crate) error: Option<String>,
    _changes: Subscription,
}

impl EventEmitter<Answer> for SecretRequestCard {}

impl SecretRequestCard {
    pub(crate) fn new(
        request: SecretRequest,
        title: String,
        scope_label: String,
        cx: &mut Context<Self>,
    ) -> Self {
        let input = cx.new(Input::secret_field);
        let changes = cx.subscribe(&input, |_, _, _: &crate::input::Changed, cx| cx.notify());
        Self {
            request,
            title,
            scope_label,
            input,
            saving: false,
            error: None,
            _changes: changes,
        }
    }

    pub(crate) fn secret_value(
        &self,
        cx: &App,
    ) -> Result<SecretValue, molfar_core::secrets::Error> {
        self.input.read(cx).secret_value()
    }

    pub(crate) fn set_saving(&mut self, saving: bool, cx: &mut Context<Self>) {
        self.saving = saving;
        self.input
            .update(cx, |input, _| input.set_read_only(saving));
        cx.notify();
    }

    #[cfg(test)]
    pub(crate) fn enter_value(&mut self, value: String, cx: &mut Context<Self>) {
        self.input.update(cx, |input, cx| input.set_text(value, cx));
        cx.emit(Answer::Save);
    }

    #[cfg(test)]
    pub(crate) fn input_is_empty(&self, cx: &App) -> bool {
        self.input.read(cx).content.is_empty()
    }

    pub(crate) fn clear(&mut self, cx: &mut Context<Self>) {
        self.input.update(cx, |input, cx| input.clear_secret(cx));
    }

    pub(crate) fn cancel(&mut self, cx: &mut Context<Self>) {
        self.clear(cx);
        cx.emit(Answer::Cancel);
    }
}

impl Render for SecretRequestCard {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let disabled = self.saving || !SecretValue::valid(&self.input.read(cx).content);
        div()
            .flex()
            .flex_col()
            .gap_2()
            .p_3()
            .mb_2()
            .rounded_md()
            .border_1()
            .border_color(content(0.18))
            .on_key_down(cx.listener(|this, event: &gpui::KeyDownEvent, _, cx| {
                if event.keystroke.key == "escape" {
                    this.cancel(cx);
                    cx.stop_propagation();
                }
            }))
            .child(format!("Secret request · {}", self.request.name.as_str()))
            .child(format!(
                "{} · {} · {}",
                self.title, self.request.agent, self.scope_label
            ))
            .child(
                div()
                    .text_color(content(0.6))
                    .child(format!("The agent says: “{}”", self.request.reason)),
            )
            .child(self.input.clone())
            .when_some(self.error.clone(), |element, error| element.child(error))
            .child(
                div()
                    .flex()
                    .gap_2()
                    .child(
                        primary_button("save-secret", "Save", disabled).when(!disabled, |button| {
                            button.on_click(cx.listener(|_, _, _, cx| cx.emit(Answer::Save)))
                        }),
                    )
                    .child(
                        secondary_button("cancel-secret", "Cancel", false, self.saving)
                            .when(!self.saving, |button| {
                                button.on_click(cx.listener(|this, _, _, cx| this.cancel(cx)))
                            }),
                    ),
            )
    }
}

impl Conversation {
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

    pub(super) fn refresh_secret_notices(&mut self, cx: &mut Context<Self>) {
        let store = self.store.clone();
        let id = self.summary.id;
        let work = cx.background_executor().spawn(async move {
            SecretRequest::history(&*crate::runtime::locked(&store)?, id)
                .map_err(|error| error.to_string())
        });
        cx.spawn(async move |this, cx| {
            let result = work.await;
            let _ = this.update(cx, |this, cx| match result {
                Ok(history) => {
                    let pending = this.secret_request(cx).map(|request| request.request_id);
                    this.secret_notices = history
                        .into_iter()
                        .rev()
                        .filter(|request| Some(&request.request_id) != pending.as_ref())
                        .map(|request| request.notice())
                        .collect();
                    cx.notify();
                }
                Err(error) => log::warn!("Secret request history for session {id}: {error}"),
            });
        })
        .detach();
    }

    pub(super) fn render_secret_notices(&self) -> Option<gpui::Stateful<gpui::Div>> {
        if self.secret_notices.is_empty() {
            return None;
        }

        Some(
            div()
                .id("secret-request-notices")
                .max_h(px(96.))
                .overflow_y_scroll()
                .flex()
                .flex_col()
                .children(self.secret_notices.iter().map(|notice| {
                    div()
                        .text_size(px(12.))
                        .text_color(content(0.55))
                        .child(notice.clone())
                })),
        )
    }

    pub(crate) fn secret_request(&self, cx: &App) -> Option<SecretRequest> {
        self.secret_card
            .as_ref()
            .map(|entity| entity.read(cx).request.clone())
    }
}
