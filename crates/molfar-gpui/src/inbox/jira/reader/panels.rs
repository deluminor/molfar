use gpui::{AnyElement, Context, Div, SharedString, div, prelude::*, px};

use super::{JiraReader, Panel};
use crate::{
    inbox::jira::actions::{DESCRIPTION_WARNING, Pending},
    settings::widgets::{primary_button, secondary_button},
    theme::*,
};

impl JiraReader {
    pub(super) fn panel_view(&self, cx: &mut Context<Self>) -> Option<AnyElement> {
        let panel = self.panel?;
        let body: AnyElement = match panel {
            Panel::Comment => div()
                .flex()
                .flex_col()
                .gap(px(8.))
                .child(field_frame(self.comment_input.clone().into_any_element()))
                .child(actions_row(
                    primary_button("jira-comment-send", "Review comment", false)
                        .child("Review comment")
                        .on_click(cx.listener(|this, _, _, cx| {
                            let body = this.comment_input.read(cx).content.to_string();
                            if body.trim().is_empty() {
                                this.error = Some("Comment is empty".into());
                            } else {
                                this.begin_comment(body);
                            }
                            cx.notify();
                        })),
                    cx,
                ))
                .into_any_element(),
            Panel::Edit => div()
                .flex()
                .flex_col()
                .gap(px(8.))
                .child(field_frame(self.summary_input.clone().into_any_element()))
                .child(field_frame(
                    self.description_input.clone().into_any_element(),
                ))
                .child(field_frame(self.labels_input.clone().into_any_element()))
                .child(
                    div()
                        .text_size(px(11.))
                        .text_color(content(0.45))
                        .child(format!(
                            "Saving a changed description: {DESCRIPTION_WARNING}"
                        )),
                )
                .child(actions_row(
                    primary_button("jira-edit-review", "Review changes", false)
                        .child("Review changes")
                        .on_click(cx.listener(|this, _, _, cx| {
                            this.begin_edit(cx);
                            cx.notify();
                        })),
                    cx,
                ))
                .into_any_element(),
            Panel::Transition => div()
                .flex()
                .flex_wrap()
                .gap(px(6.))
                .when(self.transitions.is_empty(), |d| {
                    d.child(
                        div()
                            .text_size(px(12.))
                            .text_color(content(0.5))
                            .child("Loading transitions…"),
                    )
                })
                .children(self.transitions.iter().map(|(id, name)| {
                    let (id, name) = (id.clone(), name.clone());
                    secondary_button(
                        SharedString::from(format!("jira-to-{id}")),
                        name.clone(),
                        false,
                        false,
                    )
                    .child(name.clone())
                    .on_click(cx.listener(move |this, _, _, cx| {
                        if let Some(key) = this.issue.as_ref().map(|issue| issue.key.clone()) {
                            this.pending = Some(Pending::Transition {
                                key,
                                id: id.clone(),
                                name: name.clone(),
                            });
                            cx.notify();
                        }
                    }))
                }))
                .into_any_element(),
        };
        Some(
            div()
                .debug_selector(|| "jira-panel".into())
                .flex_shrink_0()
                .mx(px(20.))
                .mt(px(12.))
                .p(px(12.))
                .rounded(px(8.))
                .border_1()
                .border_color(content(0.1))
                .bg(content(0.02))
                .child(body)
                .into_any_element(),
        )
    }

    pub(super) fn confirmation(&self, cx: &mut Context<Self>) -> Option<AnyElement> {
        let prompt = self.pending_prompt()?;
        Some(
            div()
                .debug_selector(|| "jira-confirm".into())
                .flex_shrink_0()
                .mx(px(20.))
                .mt(px(12.))
                .px(px(12.))
                .py(px(8.))
                .rounded(px(8.))
                .bg(accent_color().opacity(0.1))
                .border_1()
                .border_color(accent_color().opacity(0.3))
                .flex()
                .items_center()
                .gap(px(8.))
                .child(
                    div()
                        .flex_1()
                        .min_w_0()
                        .line_clamp(2)
                        .text_size(px(12.))
                        .text_color(content(0.9))
                        .child(prompt),
                )
                .child(
                    secondary_button("jira-confirm-cancel", "Cancel", false, self.writing)
                        .child("Cancel")
                        .on_click(cx.listener(|this, _, _, cx| {
                            this.cancel();
                            cx.notify();
                        })),
                )
                .child(
                    primary_button(
                        "jira-confirm-send",
                        if self.writing { "Saving…" } else { "Confirm" },
                        self.writing,
                    )
                    .child(if self.writing { "Saving…" } else { "Confirm" })
                    .on_click(cx.listener(|this, _, _, cx| this.confirm(cx))),
                )
                .into_any_element(),
        )
    }
}

fn field_frame(input: AnyElement) -> Div {
    div()
        .min_w_0()
        .px(px(8.))
        .py(px(6.))
        .rounded(px(6.))
        .border_1()
        .border_color(content(0.1))
        .bg(content(0.02))
        .child(input)
}

fn actions_row(primary: gpui::Stateful<Div>, cx: &mut Context<JiraReader>) -> Div {
    div()
        .flex()
        .justify_end()
        .gap(px(8.))
        .child(
            secondary_button("jira-panel-cancel", "Cancel", false, false)
                .child("Cancel")
                .on_click(cx.listener(|this, _, _, cx| {
                    this.panel = None;
                    cx.notify();
                })),
        )
        .child(primary)
}
