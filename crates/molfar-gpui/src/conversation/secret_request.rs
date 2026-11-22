use super::accounts::{composer_banner, usage_button};
use super::*;
use crate::input::Input;
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
    focus_pending: bool,
    _subscriptions: [Subscription; 2],
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
        let submit = cx.subscribe(&input, |this, _, _: &crate::input::Submitted, cx| {
            this.save(cx);
        });
        Self {
            request,
            title,
            scope_label,
            input,
            saving: false,
            error: None,
            focus_pending: false,
            _subscriptions: [changes, submit],
        }
    }

    pub(crate) fn take_secret(
        &mut self,
        cx: &mut Context<Self>,
    ) -> Result<SecretValue, molfar_core::secrets::Error> {
        self.input
            .update(cx, |input, cx| input.take_reusable_secret(cx))
    }

    pub(crate) fn save_failed(&mut self, error: &str, cx: &mut Context<Self>) {
        log::warn!(
            "Could not save a requested secret for session {}: {error}",
            self.request.session
        );
        self.error = Some("Could not save secret. Enter the value to retry.".into());
        self.set_saving(false, cx);
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
        if !self.saving {
            self.clear(cx);
            cx.emit(Answer::Cancel);
        }
    }
    fn save(&mut self, cx: &mut Context<Self>) {
        if self.can_save(cx) {
            cx.emit(Answer::Save);
        }
    }

    fn can_save(&self, cx: &App) -> bool {
        !self.saving && SecretValue::valid(&self.input.read(cx).content)
    }

    pub(crate) fn focus_on_mount(&mut self) {
        self.focus_pending = true;
    }
}

impl Render for SecretRequestCard {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        if std::mem::take(&mut self.focus_pending) {
            window.focus(&self.input.focus_handle(cx), cx);
        }

        let disabled = !self.can_save(cx);
        let save_label = if self.saving { "Saving…" } else { "Save" };
        div().px(px(8.)).child(
            composer_banner("secret-request-banner", AMBER_400)
                .py_2()
                .items_start()
                .on_key_down(cx.listener(|this, event: &gpui::KeyDownEvent, _, cx| {
                    if event.keystroke.key == "escape" {
                        this.cancel(cx);
                        cx.stop_propagation();
                    }
                }))
                .child(icon("key", 14.).text_color(gpui::rgb(AMBER_400)))
                .child(
                    div()
                        .min_w_0()
                        .flex_1()
                        .flex()
                        .flex_col()
                        .gap_1()
                        .child(format!("Secret requested: {}", self.request.name.as_str()))
                        .child(div().text_color(content(0.55)).child(format!(
                            "{} · {} · {}",
                            self.title, self.request.agent, self.scope_label
                        )))
                        .child(
                            div()
                                .text_color(content(0.65))
                                .child(format!("Agent says: “{}”", self.request.reason)),
                        )
                        .child(
                            div()
                                .flex()
                                .items_center()
                                .gap_2()
                                .child(div().min_w_0().flex_1().child(self.input.clone()))
                                .child(
                                    usage_button("save-secret", save_label, true, disabled, false)
                                        .child(save_label)
                                        .when(!disabled, |button| {
                                            button.on_click(
                                                cx.listener(|this, _, _, cx| this.save(cx)),
                                            )
                                        }),
                                )
                                .child(
                                    usage_button(
                                        "cancel-secret",
                                        "Cancel",
                                        false,
                                        self.saving,
                                        false,
                                    )
                                    .child("Cancel")
                                    .when(
                                        !self.saving,
                                        |button| {
                                            button.on_click(
                                                cx.listener(|this, _, _, cx| this.cancel(cx)),
                                            )
                                        },
                                    ),
                                ),
                        )
                        .children(self.error.clone()),
                ),
        )
    }
}

#[path = "secret_request/notices.rs"]
mod notices;
pub(crate) use notices::outcome_text;

#[cfg(test)]
#[path = "secret_request/tests.rs"]
mod tests;

#[cfg(all(test, target_os = "macos"))]
#[path = "secret_request/qa.rs"]
mod qa;
