use super::*;
use crate::{settings::widgets::secondary_button, theme::content};
use gpui::{AnyElement, SharedString, px};
use molfar_core::secrets::Scope;

impl SecretsPage {
    pub(super) fn scope_label(&self, scope: &Scope) -> String {
        if scope == &Scope::Global {
            return "Global".into();
        }
        let Some(project) = self.scopes.iter().find(|project| &project.scope() == scope) else {
            return "Missing project".into();
        };
        if project.is_missing() {
            format!("Missing project (last path {})", project.last_path)
        } else {
            project.last_label.clone()
        }
    }

    pub(super) fn entry_row(&self, entry: &Entry, cx: &mut Context<Self>) -> AnyElement {
        let id = |verb| SharedString::from(format!("{verb}-{}", entry.id));
        let rename = entry.clone();
        let replace = entry.clone();
        let delete = entry.clone();
        let date = |timestamp| {
            chrono::DateTime::from_timestamp(timestamp, 0)
                .map(|time| time.format("%Y-%m-%d").to_string())
                .unwrap_or_default()
        };
        let delete_label = if entry.delete_failed {
            "Delete failed · Retry"
        } else {
            "Delete"
        };

        div()
            .flex()
            .flex_wrap()
            .items_center()
            .gap_2()
            .border_t_1()
            .border_color(content(0.12))
            .py_2()
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .child(entry.name.as_str().to_owned())
                    .child(
                        div()
                            .text_size(px(12.))
                            .text_color(content(0.56))
                            .child(format!(
                                "{} · Created {} · Updated {}",
                                self.scope_label(&entry.scope),
                                date(entry.created_at),
                                date(entry.updated_at)
                            )),
                    ),
            )
            .when(!entry.delete_failed, |row| {
                row.child(
                    secondary_button(id("rename"), "Rename", false, self.busy).when(
                        !self.busy,
                        |button| {
                            button.on_click(cx.listener(move |this, _, _, cx| {
                                this.clear_form(cx);
                                this.name.update(cx, |input, cx| {
                                    input.set_text(rename.name.as_str().to_owned(), cx)
                                });
                                this.edit = Some(Edit::Rename(rename.clone()));
                                cx.notify();
                            }))
                        },
                    ),
                )
                .child(
                    secondary_button(id("replace"), "Replace", false, self.busy).when(
                        !self.busy,
                        |button| {
                            button.on_click(cx.listener(move |this, _, _, cx| {
                                this.clear_form(cx);
                                this.edit = Some(Edit::Replace(replace.clone()));
                                cx.notify();
                            }))
                        },
                    ),
                )
            })
            .child(
                secondary_button(id("delete"), delete_label, true, self.busy).when(
                    !self.busy,
                    |button| {
                        button.on_click(cx.listener(move |this, _, window, cx| {
                            this.clear_form(cx);
                            this.confirm_entry(
                                "Delete",
                                delete.clone(),
                                window,
                                cx,
                                |store, db, entry| {
                                    store
                                        .delete(db, &entry.id)
                                        .map_err(|error| error.to_string())
                                },
                            );
                        }))
                    },
                ),
            )
            .into_any_element()
    }
}
