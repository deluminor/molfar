use gpui::{AnyElement, Context, FontWeight, Role, SharedString, Window, div, prelude::*, px};
use molfar_core::jira::issue::{Issue, Linked};

use super::JiraReader;
use crate::{
    inbox::{
        avatar_image,
        jira::{style::Tone, widgets::*},
        relative_time,
    },
    knowledge::render_preview,
    theme::*,
};

impl JiraReader {
    pub(super) fn details(&self, issue: &Issue) -> AnyElement {
        let mut rows: Vec<(&'static str, String)> = vec![
            ("Sprint", issue.sprint.clone()),
            ("Epic", issue.epic.clone()),
            ("Components", issue.components.join(", ")),
            ("Fix versions", issue.fix_versions.join(", ")),
            ("Due", issue.due.clone()),
            ("Resolution", issue.resolution.clone()),
            ("Created", relative_time(&issue.created)),
        ];
        if !issue.work.spent.is_empty() || !issue.work.original.is_empty() {
            rows.push((
                "Time",
                format!(
                    "{} logged · {} estimated · {} left",
                    dash(&issue.work.spent),
                    dash(&issue.work.original),
                    dash(&issue.work.remaining)
                ),
            ));
        }
        div()
            .debug_selector(|| "jira-details".into())
            .rounded(px(8.))
            .border_1()
            .border_color(content(0.08))
            .px(px(12.))
            .py(px(8.))
            .flex()
            .flex_col()
            .gap(px(6.))
            .when(!issue.labels.is_empty(), |card| {
                card.child(
                    div()
                        .flex()
                        .items_center()
                        .child(meta_label("Labels"))
                        .child(
                            div()
                                .flex_1()
                                .min_w_0()
                                .flex()
                                .flex_wrap()
                                .gap(px(4.))
                                .children(
                                    issue.labels.iter().map(|label| chip("note", label.clone())),
                                ),
                        ),
                )
            })
            .children(rows.into_iter().filter(|(_, value)| !value.is_empty()).map(
                |(label, value)| {
                    div()
                        .min_w_0()
                        .flex()
                        .items_center()
                        .child(meta_label(label))
                        .child(
                            div()
                                .flex_1()
                                .min_w_0()
                                .truncate()
                                .text_size(px(12.))
                                .text_color(content(0.8))
                                .child(value),
                        )
                },
            ))
            .into_any_element()
    }

    pub(super) fn linked(
        &self,
        id: &str,
        items: &[Linked],
        cx: &mut Context<Self>,
    ) -> Vec<AnyElement> {
        items
            .iter()
            .enumerate()
            .map(|(index, item)| {
                let key = item.key.clone();
                div()
                    .id(SharedString::from(format!("jira-{id}-{index}")))
                    .role(Role::Link)
                    .h(px(30.))
                    .px(px(8.))
                    .flex()
                    .items_center()
                    .gap(px(8.))
                    .rounded(px(6.))
                    .cursor_pointer()
                    .hover(|s| s.bg(content(0.05)))
                    .text_size(px(12.))
                    .when(!item.relation.is_empty(), |d| {
                        d.child(
                            div()
                                .w(px(88.))
                                .flex_shrink_0()
                                .truncate()
                                .text_color(content(0.45))
                                .child(item.relation.clone()),
                        )
                    })
                    .child(
                        div()
                            .flex_shrink_0()
                            .font_weight(FontWeight::MEDIUM)
                            .text_color(content(0.7))
                            .child(item.key.clone()),
                    )
                    .child(
                        div()
                            .flex_1()
                            .min_w_0()
                            .truncate()
                            .text_color(content(0.9))
                            .child(item.summary.clone()),
                    )
                    .when(!item.status.is_empty(), |d| {
                        d.child(lozenge(item.status.clone(), Tone::of("", &item.status)))
                    })
                    .on_click(cx.listener(move |this, _, _, cx| this.open(key.clone(), cx)))
                    .into_any_element()
            })
            .collect()
    }

    pub(super) fn attachments(&self, issue: &Issue, cx: &mut Context<Self>) -> Vec<AnyElement> {
        issue
            .attachments
            .iter()
            .map(|item| {
                let path = self.media.join(&item.id);
                let present = path.is_file();
                div()
                    .id(SharedString::from(format!("jira-file-{}", item.id)))
                    .role(Role::Button)
                    .h(px(30.))
                    .px(px(8.))
                    .flex()
                    .items_center()
                    .gap(px(8.))
                    .rounded(px(6.))
                    .text_size(px(12.))
                    .when(present, |d| {
                        d.cursor_pointer().hover(|s| s.bg(content(0.05)))
                    })
                    .child(icon("file", 13.).text_color(content(0.5)))
                    .child(div().flex_1().min_w_0().truncate().child(item.name.clone()))
                    .child(div().text_color(content(0.4)).child(size_label(item.size)))
                    .on_click(cx.listener(move |_, _, _, cx| {
                        if path.is_file() {
                            cx.open_url(&format!("file://{}", path.display()));
                        }
                    }))
                    .into_any_element()
            })
            .collect()
    }

    /// The comment at `position` in the chosen order, newest or oldest first.
    pub(super) fn comment(
        &self,
        position: usize,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let count = self.comments.len();
        let index = if self.newest {
            count.saturating_sub(position + 1)
        } else {
            position
        };
        let Some((comment, blocks)) = self.comments.get(index) else {
            return div().into_any_element();
        };

        div()
            .debug_selector(|| "jira-comment".into())
            .mt(px(12.))
            .flex()
            .gap(px(10.))
            .child(avatar_image("jira", &comment.author, "", 24., window, cx))
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap(px(6.))
                            .text_size(px(12.))
                            .child(
                                div()
                                    .font_weight(FontWeight::SEMIBOLD)
                                    .text_color(content(0.9))
                                    .child(comment.author.clone()),
                            )
                            .child(
                                div()
                                    .text_color(content(0.45))
                                    .child(relative_time(&comment.created)),
                            ),
                    )
                    .child(
                        div()
                            .text_size(px(13.))
                            .children(render_preview(self, blocks, cx)),
                    ),
            )
            .into_any_element()
    }
}

fn dash(value: &str) -> &str {
    if value.is_empty() { "—" } else { value }
}

fn size_label(bytes: u64) -> String {
    match bytes {
        0..1024 => format!("{bytes} B"),
        1024..1_048_576 => format!("{:.0} KB", bytes as f64 / 1024.),
        _ => format!("{:.1} MB", bytes as f64 / 1_048_576.),
    }
}
