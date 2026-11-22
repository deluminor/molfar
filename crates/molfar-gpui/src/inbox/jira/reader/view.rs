use gpui::{
    AnyElement, Context, FontWeight, IntoElement, Render, Role, Window, div, prelude::*, px,
};
use molfar_core::jira::issue::Issue;

use super::JiraReader;
use crate::{
    inbox::{
        avatar_image,
        jira::{
            style::{Tone, priority_glyph, type_glyph},
            widgets::*,
        },
        relative_time,
        ui::message,
    },
    knowledge::{self, render_preview},
    theme::*,
};

impl JiraReader {
    fn header(&self, issue: &Issue, window: &mut Window, cx: &mut Context<Self>) -> AnyElement {
        let (type_icon, type_ink) = type_glyph(&issue.type_name);
        let tone = Tone::of("", &issue.status);
        let people = [("Reporter", &issue.reporter), ("Assignee", &issue.assignee)];
        div()
            .flex_shrink_0()
            .px(px(20.))
            .pt(px(20.))
            .pb(px(14.))
            .flex()
            .flex_col()
            .gap(px(10.))
            .border_b_1()
            .border_color(content(0.07))
            .child(
                div()
                    .min_w_0()
                    .flex()
                    .items_center()
                    .gap(px(8.))
                    .text_size(px(12.))
                    .text_color(content(0.5))
                    .child(icon(type_icon, 14.).text_color(type_ink))
                    .child(div().flex_shrink_0().child(issue.type_name.clone()))
                    .child(
                        div()
                            .flex_shrink_0()
                            .font_weight(FontWeight::MEDIUM)
                            .text_color(content(0.7))
                            .child(issue.key.clone()),
                    )
                    .when(!issue.status.is_empty(), |d| {
                        d.child(lozenge(issue.status.clone(), tone))
                    })
                    .children(priority_glyph(&issue.priority).map(|(glyph, ink)| {
                        div()
                            .flex()
                            .items_center()
                            .gap(px(4.))
                            .child(icon(glyph, 12.).text_color(ink))
                            .child(issue.priority.clone())
                    })),
            )
            .child(
                div()
                    .line_clamp(2)
                    .text_size(px(20.))
                    .line_height(px(25.))
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(content(1.))
                    .child(issue.summary.clone()),
            )
            .child(
                div()
                    .min_w_0()
                    .flex()
                    .items_center()
                    .gap(px(8.))
                    .overflow_hidden()
                    .text_size(px(12.))
                    .text_color(content(0.5))
                    .children(people.into_iter().filter(|(_, name)| !name.is_empty()).map(
                        |(role, name)| {
                            div()
                                .flex_shrink_0()
                                .flex()
                                .items_center()
                                .gap(px(6.))
                                .child(avatar_image("jira", name, "", 16., window, cx))
                                .child(format!("{role} {name}"))
                        },
                    ))
                    .when(!issue.updated.is_empty(), |d| {
                        d.child("·")
                            .child(format!("Updated {}", relative_time(&issue.updated)))
                    }),
            )
            .child(self.toolbar(issue, cx))
            .into_any_element()
    }
}

impl Render for JiraReader {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        if self.loading && self.issue.is_none() {
            return div()
                .size_full()
                .pt(px(64.))
                .flex()
                .flex_col()
                .items_center()
                .child(knowledge::orbit_loader(
                    "jira-orbit",
                    "Loading issue…".into(),
                    None,
                ))
                .child(
                    div()
                        .w_full()
                        .max_w(px(520.))
                        .child(knowledge::skeleton_rows("jira-skeleton")),
                )
                .into_any_element();
        }
        let Some(issue) = self.issue.clone() else {
            return div()
                .size_full()
                .flex()
                .flex_col()
                .items_center()
                .justify_center()
                .gap(px(12.))
                .child(icon("inbox-jira", 24.).text_color(content(0.3)))
                .child(message("Select a Jira issue").text_size(px(13.)))
                .when_some(self.error.clone(), |d, error| {
                    d.child(knowledge::banner("jira-error", 0.0, "alert-circle", error))
                })
                .into_any_element();
        };
        let body = render_preview(self, &self.description, cx);
        let comments = self.comment_list(window, cx);
        let subtasks = self.linked("subtask", &issue.subtasks, cx);
        let links = self.linked("link", &issue.links, cx);
        let files = self.attachments(&issue, cx);

        div()
            .id("jira-reader")
            .debug_selector(|| "jira-reader".into())
            .size_full()
            .flex()
            .flex_col()
            .child(self.header(&issue, window, cx))
            .when_some(self.error.clone(), |pane, error| {
                pane.child(div().px(px(20.)).pt(px(10.)).child(knowledge::banner(
                    "jira-error",
                    0.0,
                    "alert-circle",
                    error,
                )))
            })
            .children(self.confirmation(cx))
            .children(self.panel_view(cx))
            .child(
                div()
                    .id("jira-reader-body")
                    .flex_1()
                    .min_h_0()
                    .overflow_y_scroll()
                    .track_scroll(&self.scroll)
                    .child(
                        div()
                            .max_w(px(820.))
                            .px(px(20.))
                            .pt(px(16.))
                            .pb(px(40.))
                            .child(self.details(&issue))
                            .child(section_title("Description"))
                            .child(if body.is_empty() {
                                message("No description").p_0().into_any_element()
                            } else {
                                div().text_size(px(13.)).children(body).into_any_element()
                            })
                            .when(!subtasks.is_empty(), |d| {
                                d.child(section_title(format!("Sub-tasks · {}", subtasks.len())))
                                    .children(subtasks)
                            })
                            .when(!links.is_empty(), |d| {
                                d.child(section_title("Linked issues")).children(links)
                            })
                            .when(!files.is_empty(), |d| {
                                d.child(section_title("Attachments")).children(files)
                            })
                            .child(
                                section_title(format!("Comments · {}", self.comments.len()))
                                    .child(div().flex_1())
                                    .child(
                                        div()
                                            .id("jira-comment-order")
                                            .role(Role::Button)
                                            .cursor_pointer()
                                            .text_color(content(0.5))
                                            .hover(|s| s.text_color(content(1.)))
                                            .child(if self.newest {
                                                "Newest first"
                                            } else {
                                                "Oldest first"
                                            })
                                            .on_click(cx.listener(|this, _, _, cx| {
                                                this.newest = !this.newest;
                                                cx.notify();
                                            })),
                                    ),
                            )
                            .when(comments.is_empty(), |d| {
                                d.child(message("No comments yet").p_0())
                            })
                            .children(comments),
                    ),
            )
            .into_any_element()
    }
}
