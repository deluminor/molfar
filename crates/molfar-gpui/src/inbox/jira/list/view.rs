use gpui::{
    Context, Focusable, FontWeight, IntoElement, Render, Role, Window, div, list, prelude::*, px,
};
use molfar_core::jira::Filter;

use super::{Browse, JiraList};
use crate::{
    inbox::{jira::widgets::segment, ui::message},
    knowledge,
    theme::*,
};

mod menu;
mod row;

const FILTERS: [(&str, &str, Filter); 4] = [
    ("Assigned", "Assigned to me", Filter::AssignedToMe),
    ("Reported", "Reported by me", Filter::ReportedByMe),
    ("Watched", "Watched by me", Filter::Watched),
    ("Sprint", "Current sprint", Filter::CurrentSprint),
];

impl JiraList {
    fn filter_bar(&self, cx: &mut Context<Self>) -> impl IntoElement {
        let jql = matches!(self.filter, Filter::Jql(_));
        div()
            .id("jira-filters")
            .h(px(36.))
            .px(px(8.))
            .flex_shrink_0()
            .flex()
            .items_center()
            .gap(px(1.))
            .border_b_1()
            .border_color(content(0.07))
            .role(Role::TabList)
            .aria_label("Jira filters")
            .children(FILTERS.into_iter().map(|(label, hint, filter)| {
                let active = self.browse == Browse::Issues && self.filter == filter;
                segment(format!("jira-filter-{label}"), label, hint, active)
                    .on_click(cx.listener(move |this, _, _, cx| this.choose(filter.clone(), cx)))
            }))
            .child(
                segment(
                    "jira-filter-jql",
                    "JQL",
                    "Custom JQL",
                    jql && self.browse == Browse::Issues,
                )
                .on_click(cx.listener(|this, _, window, cx| {
                    this.filter = Filter::Jql(String::new());
                    this.browse = Browse::Issues;
                    window.focus(&this.jql.focus_handle(cx), cx);
                    cx.notify();
                })),
            )
    }

    fn tool_bar(&self, cx: &mut Context<Self>) -> impl IntoElement {
        let jql = matches!(self.filter, Filter::Jql(_)) && self.browse == Browse::Issues;
        let summary = match &self.browse {
            Browse::Issues => format!(
                "{}{} issue{}",
                self.model.rows.len(),
                if self.model.next.is_some() { "+" } else { "" },
                if self.model.rows.len() == 1 && self.model.next.is_none() {
                    ""
                } else {
                    "s"
                }
            ),
            Browse::Projects => "Projects".into(),
            Browse::Epics(project) => format!("Epics in {project}"),
            Browse::Children(epic) => format!("Issues in {epic}"),
        };
        let browsing = self.browse != Browse::Issues;
        div()
            .h(px(36.))
            .px(px(8.))
            .flex_shrink_0()
            .flex()
            .items_center()
            .gap(px(1.))
            .border_b_1()
            .border_color(content(0.07))
            .when(browsing, |bar| {
                bar.child(
                    icon_button("jira-back", "Back", "arrow-left")
                        .on_click(cx.listener(|this, _, _, cx| this.back(cx))),
                )
            })
            .child(if jql {
                div()
                    .flex_1()
                    .min_w_0()
                    .h(px(28.))
                    .px(px(6.))
                    .flex()
                    .items_center()
                    .gap(px(6.))
                    .rounded(px(6.))
                    .border_1()
                    .border_color(content(0.1))
                    .child(icon("search", 12.).text_color(content(0.45)))
                    .child(div().flex_1().min_w_0().child(self.jql.clone()))
                    .into_any_element()
            } else {
                div()
                    .flex_1()
                    .min_w_0()
                    .px(px(6.))
                    .truncate()
                    .text_size(px(11.))
                    .text_color(content(0.45))
                    .child(summary)
                    .into_any_element()
            })
            .when(jql, |bar| {
                bar.child(
                    icon_button("jira-run-jql", "Run JQL", "arrow-down-circle").on_click(
                        cx.listener(|this, _, _, cx| this.choose(Filter::Jql(String::new()), cx)),
                    ),
                )
            })
            .child(
                icon_button("jira-view-options", "View options", "sliders")
                    .relative()
                    .child(self.menu_anchor.probe())
                    .when(self.menu_open || self.grouping.is_some(), |d| {
                        d.bg(content(0.1))
                    })
                    .on_click(cx.listener(|this, _, _, cx| {
                        this.menu_open = !this.menu_open;
                        cx.notify();
                    })),
            )
            .child(
                icon_button("jira-copy-jql", "Copy Jira link", "link")
                    .on_click(cx.listener(|this, _, _, cx| this.copy_link(cx))),
            )
            .child(
                icon_button("jira-share-list", "Add list to chat", "comment-add")
                    .on_click(cx.listener(|this, _, _, cx| this.share(cx))),
            )
            .child(
                icon_button(
                    "jira-refresh",
                    "Refresh",
                    if self.loading { "loader" } else { "refresh-cw" },
                )
                .on_click(cx.listener(|this, _, _, cx| this.reload(true, cx))),
            )
    }
}

impl Render for JiraList {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let entity = cx.entity();
        let empty = self.entries.is_empty();
        div()
            .id("jira-list")
            .debug_selector(|| "jira-list".into())
            .track_focus(&self.focus)
            .size_full()
            .flex()
            .flex_col()
            .on_key_down(cx.listener(|this, event: &gpui::KeyDownEvent, _, cx| {
                match event.keystroke.key.as_str() {
                    "down" => this.step(true, cx),
                    "up" => this.step(false, cx),
                    _ => return,
                }
                cx.stop_propagation();
            }))
            .child(self.filter_bar(cx))
            .child(self.tool_bar(cx))
            .children(self.state_view(cx))
            .child(if empty && self.loading {
                div()
                    .flex_1()
                    .child(knowledge::skeleton_rows("jira-skeleton"))
                    .into_any_element()
            } else if empty {
                div()
                    .flex_1()
                    .flex()
                    .flex_col()
                    .items_center()
                    .pt(px(48.))
                    .gap(px(8.))
                    .child(icon("inbox-jira", 22.).text_color(content(0.25)))
                    .child(message(match self.filter {
                        Filter::Jql(_) => "Type JQL and press Enter",
                        _ => "No Jira issues match this filter",
                    }))
                    .into_any_element()
            } else {
                list(self.list.clone(), move |ix, window, cx| {
                    entity.update(cx, |this, cx| this.entry(ix, window, cx))
                })
                .flex_1()
                .min_h_0()
                .into_any_element()
            })
            .when(self.model.capped, |pane| {
                pane.child(
                    div()
                        .h(px(26.))
                        .px(px(12.))
                        .flex()
                        .items_center()
                        .border_t_1()
                        .border_color(content(0.07))
                        .text_size(px(11.))
                        .text_color(content(0.45))
                        .font_weight(FontWeight::MEDIUM)
                        .child("Showing the first 500 issues. Narrow the JQL to see more."),
                )
            })
            .when(self.menu_open, |pane| pane.child(self.view_menu(cx)))
    }
}
