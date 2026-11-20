use super::*;
use crate::settings::widgets::secondary_button;
use gpui::{AnyElement, Role, Toggled};
use molfar_core::secrets::{
    Scope, SecretName,
    bind::{self, ProjectBindings, SecretBinding},
};

const WARNING: &str = "Every tool of the agent sees this variable.";

pub(super) struct BindingEditor {
    project: Option<String>,
    secret: Option<String>,
    index: Option<usize>,
    env: Entity<Input>,
    _subscription: Subscription,
}

impl BindingEditor {
    pub(super) fn new(cx: &mut Context<SecretsPage>) -> Self {
        let env = cx.new(|cx| {
            Input::field(
                "Environment variable",
                "API_KEY",
                crate::theme::content(0.35),
                cx,
            )
        });
        let subscription = cx.subscribe(&env, |_, _, _: &input::Changed, cx| cx.notify());
        Self {
            project: None,
            secret: None,
            index: None,
            env,
            _subscription: subscription,
        }
    }

    fn clear(&mut self, cx: &mut Context<SecretsPage>) {
        self.secret = None;
        self.index = None;
        self.env
            .update(cx, |input, cx| input.set_text(String::new(), cx));
    }
}

impl SecretsPage {
    pub(super) fn binding_groups(&self, cx: &mut Context<Self>) -> AnyElement {
        div()
            .flex()
            .flex_col()
            .gap_2()
            .children(
                self.scopes
                    .iter()
                    .filter(|project| !project.is_missing())
                    .map(|project| {
                        let id = project.id.clone();
                        let active = self.binding.project.as_ref() == Some(&id);
                        let group = div().flex().flex_col().gap_2().child(
                            secondary_button(
                                gpui::SharedString::from(format!(
                                    "session-environment-{}",
                                    project.id
                                )),
                                format!("Session environment · {}", project.last_label),
                                false,
                                self.busy,
                            )
                            .on_click(cx.listener(
                                move |this, _, _, cx| {
                                    this.binding.clear(cx);
                                    this.binding.project = (!active).then(|| id.clone());
                                    cx.notify();
                                },
                            )),
                        );
                        if active {
                            group.child(self.binding_group(project, cx))
                        } else {
                            group
                        }
                    }),
            )
            .into_any_element()
    }

    fn binding_group(&self, project: &Project, cx: &mut Context<Self>) -> AnyElement {
        let config = self.bindings.get(&project.id).cloned().unwrap_or_default();
        let on = config.enabled;
        let id = project.id.clone();
        let mut toggled = config.clone();
        toggled.enabled = !on;
        let mut group = div().flex().flex_col().gap_2().child(
            secondary_button(
                "secret-bind-toggle",
                "Inject on session start",
                false,
                self.busy,
            )
            .role(Role::Switch)
            .aria_toggled(if on { Toggled::True } else { Toggled::False })
            .on_click(cx.listener(move |this, _, _, cx| {
                this.save_bindings(id.clone(), toggled.clone(), cx)
            })),
        );
        if on {
            group = group.child(note(WARNING));
        }
        group
            .children(config.items.iter().enumerate().map(|(index, item)| {
                let entry = self.entries.iter().find(|entry| entry.id == item.secret_id);
                let label = entry.map_or("Unavailable", |entry| entry.name.as_str());
                let item = item.clone();
                let id = project.id.clone();
                let mut removed = config.clone();
                removed.items.remove(index);
                div()
                    .flex()
                    .gap_2()
                    .items_center()
                    .child(
                        secondary_button(
                            ("edit-binding", index),
                            format!("{label} as {}", item.env.as_str()),
                            false,
                            self.busy,
                        )
                        .on_click(cx.listener(move |this, _, _, cx| {
                            this.binding.index = Some(index);
                            this.binding.secret = Some(item.secret_id.clone());
                            this.binding.env.update(cx, |input, cx| {
                                input.set_text(item.env.as_str().into(), cx)
                            });
                            cx.notify();
                        })),
                    )
                    .child(
                        secondary_button(("remove-binding", index), "Remove", true, self.busy)
                            .on_click(cx.listener(move |this, _, _, cx| {
                                this.save_bindings(id.clone(), removed.clone(), cx)
                            })),
                    )
            }))
            .child(self.binding_picker(project, config.clone(), cx))
            .into_any_element()
    }

    fn binding_picker(
        &self,
        project: &Project,
        config: ProjectBindings,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let scope = project.scope();
        let env = SecretName::parse(self.binding.env.read(cx).content.to_string())
            .map_err(|error| error.to_string())
            .and_then(|env| molfar_core::secrets::run::validate_env(&env).map(|()| env));
        let editing = self.binding.index;
        let item = env
            .ok()
            .zip(self.binding.secret.clone())
            .and_then(|(env, secret_id)| {
                if config
                    .items
                    .iter()
                    .enumerate()
                    .any(|(index, item)| Some(index) != editing && item.env == env)
                {
                    return None;
                }
                Some(SecretBinding { env, secret_id })
            });
        let id = project.id.clone();
        div()
            .flex()
            .flex_col()
            .gap_2()
            .child(note("Choose a secret and enter its environment variable."))
            .children(
                self.entries
                    .iter()
                    .filter(|entry| {
                        !entry.delete_failed
                            && (entry.scope == Scope::Global || entry.scope == scope)
                    })
                    .map(|entry| {
                        let id = entry.id.clone();
                        let selected = self.binding.secret.as_ref() == Some(&id);
                        secondary_button(
                            gpui::SharedString::from(format!("bind-pick-{id}")),
                            format!(
                                "{} · {}",
                                entry.name.as_str(),
                                self.scope_label(&entry.scope)
                            ),
                            false,
                            self.busy,
                        )
                        .aria_toggled(if selected {
                            Toggled::True
                        } else {
                            Toggled::False
                        })
                        .on_click(cx.listener(move |this, _, _, cx| {
                            this.binding.secret = Some(id.clone());
                            cx.notify();
                        }))
                    }),
            )
            .child(self.binding.env.clone())
            .child(
                primary_button(
                    "add-secret-binding",
                    if editing.is_some() {
                        "Update binding"
                    } else {
                        "Add binding"
                    },
                    self.busy || item.is_none(),
                )
                .on_click(cx.listener(move |this, _, _, cx| {
                    if let Some(item) = item.clone() {
                        let mut config = config.clone();
                        if let Some(existing) =
                            editing.and_then(|index| config.items.get_mut(index))
                        {
                            *existing = item;
                        } else {
                            config.items.push(item);
                        }
                        this.save_bindings(id.clone(), config, cx);
                    }
                })),
            )
            .into_any_element()
    }

    fn save_bindings(&mut self, project: String, config: ProjectBindings, cx: &mut Context<Self>) {
        if !self.busy {
            self.binding.clear(cx);
            self.run(
                false,
                move |store, db| bind::configure(store, db, &project, config),
                cx,
            );
        }
    }
}
