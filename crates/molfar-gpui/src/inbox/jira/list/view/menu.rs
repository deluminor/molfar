use gpui::{AnyElement, Context, div, prelude::*, px};
use molfar_core::jira::{Filter, GroupBy};

use super::super::{Browse, Event, JiraList};
use crate::{
    inbox::ui::{action, caption, menu_row},
    popover::{Align, Anchor, popover},
    theme::*,
};

impl JiraList {
    pub(super) fn view_menu(&self, cx: &mut Context<Self>) -> AnyElement {
        let weak = cx.entity().downgrade();
        let grouping = [
            ("jira-group-none", "No grouping", None),
            ("jira-group-epic", "Group by epic", Some(GroupBy::Epic)),
            (
                "jira-group-status",
                "Group by status",
                Some(GroupBy::Status),
            ),
        ];
        let mut rows = vec![caption("GROUP").into_any_element()];
        rows.extend(grouping.into_iter().map(|(id, label, value)| {
            menu_row(id, label, self.grouping == value)
                .on_click(cx.listener(move |this, _, _, cx| this.set_grouping(value, cx)))
                .into_any_element()
        }));
        if !self.saved.is_empty() {
            rows.push(caption("SAVED FILTERS").into_any_element());
        }
        for (index, filter) in self.saved.iter().enumerate() {
            let Filter::Saved { name, .. } = filter else {
                continue;
            };
            rows.push(
                menu_row(
                    format!("jira-saved-{index}"),
                    name.clone(),
                    self.filter == *filter,
                )
                .on_click(cx.listener(move |this, _, _, cx| {
                    if let Some(filter) = this.saved.get(index).cloned() {
                        this.choose(filter, cx);
                    }
                }))
                .into_any_element(),
            );
        }
        rows.push(caption("BROWSE").into_any_element());
        rows.push(
            menu_row(
                "jira-browse-projects",
                "Projects and epics",
                self.browse != Browse::Issues,
            )
            .on_click(cx.listener(|this, _, _, cx| this.browse_rows(Browse::Projects, cx)))
            .into_any_element(),
        );
        popover("jira-view-menu", Anchor::Slot(self.menu_anchor.clone()))
            .align(Align::End)
            .width(220.)
            .max_height(420.)
            .padding(4.)
            .on_dismiss(move |_, cx| {
                let _ = weak.update(cx, |this, cx| {
                    this.menu_open = false;
                    cx.notify();
                });
            })
            .child(
                div()
                    .id("jira-view-menu-scroll")
                    .overflow_y_scroll()
                    .children(rows),
            )
            .into_any_element()
    }

    pub(super) fn state_view(&self, cx: &mut Context<Self>) -> Option<AnyElement> {
        let not_connected = self
            .model
            .error
            .as_deref()
            .is_some_and(|error| error.contains("Connect Atlassian"));
        let problem = if self.model.offline {
            Some("Jira is offline. Showing the last loaded issues.".to_string())
        } else if self.model.unauthorized {
            Some("Jira rejected the saved credentials.".into())
        } else if self.model.rate_limited {
            Some("Jira rate limit reached. Try again in a moment.".into())
        } else {
            self.model.error.clone()
        };
        if let Some(problem) = problem {
            let manage = not_connected || self.model.unauthorized;
            return Some(
                div()
                    .m(px(8.))
                    .px(px(10.))
                    .py(px(8.))
                    .rounded(px(6.))
                    .bg(content(0.04))
                    .flex()
                    .items_center()
                    .gap(px(8.))
                    .text_size(px(12.))
                    .text_color(content(0.7))
                    .child(icon("alert-circle", 14.).text_color(content(0.6)))
                    .child(div().flex_1().min_w_0().child(problem))
                    .child(if manage {
                        action("jira-manage", "Connections")
                            .on_click(cx.listener(|_, _, _, cx| cx.emit(Event::Manage)))
                    } else {
                        action("jira-retry", "Retry")
                            .on_click(cx.listener(|this, _, _, cx| this.reload(true, cx)))
                    })
                    .into_any_element(),
            );
        }
        None
    }
}
