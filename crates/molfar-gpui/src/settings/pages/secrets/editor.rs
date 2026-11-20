use super::*;
use crate::{settings::widgets::secondary_button, theme::content};
use gpui::{IntoElement, PromptLevel};
use molfar_core::secrets::{Error, Scope, SecretName, SecretValue, Status};

#[derive(Clone)]
pub(super) enum Edit {
    Add,
    Replace(Entry),
    Rename(Entry),
}

impl SecretsPage {
    pub(super) fn editor(&self, edit: Edit, cx: &mut Context<Self>) -> impl IntoElement {
        let wants_name = matches!(edit, Edit::Add | Edit::Rename(_));
        let wants_value = matches!(edit, Edit::Add | Edit::Replace(_));
        let disabled = self.busy
            || (wants_name && SecretName::parse(self.name.read(cx).content.to_string()).is_err())
            || (wants_value && !SecretValue::valid(&self.value.read(cx).content));
        let heading = match &edit {
            Edit::Add => "Add secret".into(),
            Edit::Replace(entry) => format!("Replace {}", entry.name.as_str()),
            Edit::Rename(entry) => format!("Rename {}", entry.name.as_str()),
        };
        div()
            .flex()
            .flex_col()
            .gap_2()
            .p_3()
            .border_1()
            .border_color(content(0.15))
            .rounded_md()
            .child(heading)
            .when(wants_name, |editor| editor.child(self.name.clone()))
            .when(matches!(edit, Edit::Add), |editor| {
                editor.child(self.scope_picker(cx))
            })
            .when(wants_value, |editor| editor.child(self.value.clone()))
            .child(
                div()
                    .flex()
                    .gap_2()
                    .child(primary_button("apply-secret-edit", "Save", disabled).when(
                        !disabled,
                        |button| {
                            button.on_click(cx.listener(move |this, _, window, cx| {
                                this.apply(edit.clone(), window, cx)
                            }))
                        },
                    ))
                    .child(
                        secondary_button("discard-secret-edit", "Cancel", false, self.busy).when(
                            !self.busy,
                            |button| {
                                button.on_click(cx.listener(|this, _, _, cx| {
                                    this.clear_form(cx);
                                    cx.notify();
                                }))
                            },
                        ),
                    ),
            )
    }

    fn scope_picker(&self, cx: &mut Context<Self>) -> impl IntoElement {
        let selected = self
            .scope
            .and_then(|index| self.workspace.get(index))
            .map_or("Global", |(_, label)| label);
        div()
            .flex()
            .flex_col()
            .gap_1()
            .child(
                secondary_button(
                    "choose-secret-scope",
                    format!("Scope · {selected}"),
                    false,
                    self.busy,
                )
                .when(!self.busy, |button| {
                    button.on_click(cx.listener(|this, _, _, cx| {
                        this.choosing_scope = !this.choosing_scope;
                        cx.notify();
                    }))
                }),
            )
            .when(self.choosing_scope, |picker| {
                picker
                    .child(self.scope_option(None, "Global".into(), cx))
                    .children(
                        self.workspace
                            .iter()
                            .enumerate()
                            .filter(|(_, (path, _))| !path.starts_with("remote://"))
                            .map(|(index, (_, label))| {
                                self.scope_option(Some(index), label.clone(), cx)
                            }),
                    )
            })
    }

    fn scope_option(
        &self,
        scope: Option<usize>,
        label: String,
        cx: &mut Context<Self>,
    ) -> gpui::Stateful<gpui::Div> {
        secondary_button(
            ("secret-scope", scope.map_or(0, |i| i + 1)),
            label,
            false,
            false,
        )
        .on_click(cx.listener(move |this, _, _, cx| {
            this.scope = scope;
            this.choosing_scope = false;
            cx.notify();
        }))
    }

    pub(super) fn apply(&mut self, edit: Edit, window: &mut Window, cx: &mut Context<Self>) {
        if self.busy {
            return;
        }

        let name = || {
            SecretName::parse(self.name.read(cx).content.to_string())
                .map_err(|error| error.to_string())
        };
        match edit {
            Edit::Add => {
                let name = name();
                let value = self
                    .value
                    .read(cx)
                    .secret_value()
                    .map_err(|error| error.to_string());
                let project = self
                    .scope
                    .and_then(|index| self.workspace.get(index))
                    .cloned();
                self.run(
                    true,
                    move |store, db| {
                        let scope = match project {
                            Some((path, label)) => store
                                .project_scope(db, Path::new(&path), Some(&label))
                                .map_err(|error| error.to_string())?,
                            None => Scope::Global,
                        };
                        match store
                            .create(db, scope, name?, value?)
                            .map_err(|error| error.to_string())?
                        {
                            Status::Saved => Ok(()),
                            Status::Exists => Err(Error::Exists.to_string()),
                            status => Err(format!("Could not save secret ({status:?}).")),
                        }
                    },
                    cx,
                );
            }
            Edit::Rename(entry) => {
                let name = name();
                self.run(
                    true,
                    move |store, db| {
                        store
                            .rename(db, &entry.id, name?)
                            .map_err(|error| error.to_string())
                    },
                    cx,
                );
            }
            Edit::Replace(entry) => {
                let value = self
                    .value
                    .read(cx)
                    .secret_value()
                    .map_err(|error| error.to_string());
                self.confirm_entry("Replace", entry, window, cx, move |store, db, entry| {
                    store
                        .replace(db, &entry.id, value?)
                        .map_err(|error| error.to_string())
                });
            }
        }
    }

    pub(super) fn confirm_entry(
        &mut self,
        verb: &'static str,
        entry: Entry,
        window: &mut Window,
        cx: &mut Context<Self>,
        action: impl FnOnce(&SecretStore, &molfar_core::store::Store, Entry) -> Result<(), String>
        + Send
        + 'static,
    ) {
        if self.busy {
            return;
        }

        let message = format!("{verb} {}?", entry.name.as_str());
        let scope = self.scope_label(&entry.scope);
        let prompt = window.prompt(
            PromptLevel::Warning,
            &message,
            Some(&scope),
            &[verb, "Cancel"],
            cx,
        );
        self.set_busy(true, cx);
        cx.notify();
        cx.spawn(async move |this, cx| {
            let confirmed = prompt.await == Ok(0);
            let _ = this.update(cx, |this, cx| {
                this.set_busy(false, cx);
                if confirmed {
                    this.run(true, move |store, db| action(store, db, entry), cx);
                } else {
                    cx.notify();
                }
            });
        })
        .detach();
    }
}
