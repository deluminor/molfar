use super::*;
use crate::settings::widgets::{note, secondary_button};
use molfar_core::secrets::{
    SecretName,
    ephemeral::{SecretAnswers, provider_name},
};

pub(super) struct Save {
    name: Entity<input::Input>,
    enabled: bool,
}

impl Save {
    pub(super) fn new(id: &str, cx: &mut Context<QuestionCard>) -> Self {
        let name = provider_name(id);
        let field = cx.new(|cx| {
            let mut field =
                input::Input::field("Secret name", "PROVIDER_SECRET", content(0.35), cx);
            field.set_text(name.as_str().to_owned(), cx);
            field
        });
        Self {
            name: field,
            enabled: false,
        }
    }
}

impl QuestionCard {
    pub(super) fn masked_answers(&mut self, cx: &mut Context<Self>) -> Option<SecretAnswers> {
        let mut names = Vec::new();
        for (index, save) in self.saves.iter().enumerate() {
            let Some(save) = save else { continue };
            let input = self.fields[index].read(cx);
            if input.content.is_empty() {
                continue;
            }
            if !input.valid_one_time_secret() {
                self.secret_error = Some("Enter a value between 1 and 1024 bytes.".into());
                cx.notify();
                return None;
            }
            let name = if save.enabled {
                match SecretName::parse(save.name.read(cx).content.to_string()) {
                    Ok(name) => Some(name),
                    Err(error) => {
                        self.secret_error = Some(error.to_string());
                        cx.notify();
                        return None;
                    }
                }
            } else {
                None
            };
            names.push((index, name));
        }

        let mut answers = SecretAnswers::default();
        for (index, name) in names {
            if let Ok(value) = self.fields[index].update(cx, |field, cx| field.take_secret(cx)) {
                answers.push(index, value, name);
            }
        }
        self.secret_error = None;
        Some(answers)
    }

    pub(super) fn clear_masked(&mut self, cx: &mut Context<Self>) {
        for (index, item) in self.request.items.iter().enumerate() {
            if item.secret {
                self.fields[index].update(cx, |field, cx| field.clear_secret(cx));
            }
        }
    }

    pub(super) fn save_options(
        &self,
        index: usize,
        live: bool,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let Some(save) = &self.saves[index] else {
            return div().into_any_element();
        };
        div()
            .flex()
            .flex_col()
            .gap_1()
            .px(px(16.))
            .pb(px(6.))
            .child(note(
                "Sent to the provider only; not saved unless you opt in.",
            ))
            .child(note("Short values are redacted only as whole words."))
            .child(
                secondary_button(
                    ("question-save-secret", index),
                    "Save as secret",
                    false,
                    !live,
                )
                .role(Role::CheckBox)
                .aria_toggled(if save.enabled {
                    gpui::Toggled::True
                } else {
                    gpui::Toggled::False
                })
                .when(live, |button| {
                    button.on_click(cx.listener(move |this, _, _, cx| {
                        if let Some(save) = &mut this.saves[index] {
                            save.enabled = !save.enabled;
                        }
                        this.secret_error = None;
                        cx.notify();
                    }))
                }),
            )
            .when(save.enabled && live, |group| group.child(save.name.clone()))
            .when_some(self.secret_error.as_ref(), |group, error| {
                group.child(note(error.clone()))
            })
            .into_any_element()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[gpui::test]
    fn masked_submit_clears_the_field_and_emits_no_plaintext_answers(
        cx: &mut gpui::TestAppContext,
    ) {
        let card = cx.new(|cx| {
            QuestionCard::new(
                Question {
                    id: "one".into(),
                    title: "Prompt".into(),
                    auto_resolve_at: None,
                    items: vec![molfar_core::agent::QuestionItem {
                        id: "token".into(),
                        prompt: "Token?".into(),
                        secret: true,
                        multiple: false,
                        allow_custom: true,
                        options: Vec::new(),
                    }],
                },
                cx,
            )
        });
        let reply = std::rc::Rc::new(std::cell::RefCell::new(None));
        let result = reply.clone();
        let _subscription = cx.update(|cx| {
            cx.subscribe(&card, move |_, event: &Answered, _| {
                *result.borrow_mut() = Some((event.answers.clone(), event.secrets.clone()));
            })
        });
        card.update(cx, |card, cx| {
            card.fields[0].update(cx, |field, cx| field.set_text("123".into(), cx));
            card.finish(cx);
            assert!(card.fields[0].read(cx).content.is_empty());
        });
        let (answers, secrets) = reply.borrow_mut().take().unwrap();
        assert!(answers.is_none());
        assert_eq!(format!("{secrets:?}"), "[0]");
    }
}
