use gpui::{AnyElement, Context, FontWeight, Role, SharedString, Window, div, prelude::*, px};

use super::super::JiraList;
use crate::{
    inbox::{
        avatar_image,
        jira::{rows::Entry, widgets::*},
        ui::action,
    },
    theme::*,
};

impl JiraList {
    pub(super) fn entry(
        &self,
        ix: usize,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        match self.entries.get(ix) {
            Some(Entry::Group { title, count }) => group_header(title, *count),
            Some(Entry::Issue { index, depth }) => self.issue_row(*index, *depth, window, cx),
            Some(Entry::More) => div()
                .w_full()
                .h(px(ROW_HEIGHT))
                .px(px(6.))
                .flex()
                .items_center()
                .child(
                    action(
                        "jira-load-more",
                        if self.loading {
                            "Loading…"
                        } else {
                            "Load more"
                        },
                    )
                    .w_full()
                    .border_1()
                    .border_color(content(0.1))
                    .when(self.loading, |d| d.opacity(0.5))
                    .child(icon(
                        if self.loading {
                            "loader"
                        } else {
                            "chevron-down"
                        },
                        12.,
                    ))
                    .on_click(cx.listener(|this, _, _, cx| this.load_more(cx))),
                )
                .into_any_element(),
            None => div().into_any_element(),
        }
    }

    fn issue_row(
        &self,
        index: usize,
        depth: usize,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let Some(view) = self.views.get(index) else {
            return div().into_any_element();
        };
        let key = view.key.clone();
        let active = self.selected.as_deref() == Some(key.as_str());
        let (type_icon, type_ink) = view.type_icon;
        let avatar = (!view.assignee.is_empty())
            .then(|| avatar_image("jira", &view.assignee, &view.avatar, 16., window, cx));

        div()
            .h(px(ROW_HEIGHT))
            .px(px(6.))
            .py(px(1.))
            .pl(px(6. + depth as f32 * SUBTASK_INDENT))
            .child(
                div()
                    .id(SharedString::from(format!("jira-row-{key}")))
                    .debug_selector({
                        let key = key.clone();
                        move || format!("jira-row-{key}")
                    })
                    .role(Role::Button)
                    .aria_label(format!("{} {}", view.key, view.summary))
                    .aria_selected(active)
                    .size_full()
                    .px(px(10.))
                    .py(px(7.))
                    .flex()
                    .flex_col()
                    .justify_between()
                    .rounded(px(6.))
                    .cursor_pointer()
                    .when(depth > 0, |d| d.border_l_2().border_color(content(0.08)))
                    .when(active, |d| d.bg(content(0.1)))
                    .when(!active, |d| d.hover(|s| s.bg(content(0.05))))
                    .child(
                        div()
                            .h(px(14.))
                            .flex()
                            .items_center()
                            .gap(px(6.))
                            .text_size(px(11.))
                            .text_color(content(0.5))
                            .child(icon(type_icon, 12.).text_color(type_ink))
                            .child(
                                div()
                                    .flex_shrink_0()
                                    .font_weight(FontWeight::MEDIUM)
                                    .text_color(content(0.65))
                                    .child(view.key.clone()),
                            )
                            .children(view.priority.map(|(glyph, ink)| {
                                div()
                                    .id(SharedString::from(format!("jira-priority-{key}")))
                                    .flex_shrink_0()
                                    .child(icon(glyph, 12.).text_color(ink))
                                    .tooltip(crate::tooltip::text(view.priority_name.clone()))
                            }))
                            .child(div().flex_1())
                            .child(div().flex_shrink_0().child(view.updated.clone())),
                    )
                    .child(
                        div()
                            .min_w_0()
                            .truncate()
                            .text_size(px(13.))
                            .line_height(px(18.))
                            .font_weight(FontWeight::SEMIBOLD)
                            .text_color(content(1.))
                            .child(view.summary.clone()),
                    )
                    .child(
                        div()
                            .h(px(18.))
                            .min_w_0()
                            .flex()
                            .items_center()
                            .gap(px(6.))
                            .when(!view.status.is_empty(), |d| {
                                d.child(lozenge(view.status.clone(), view.tone))
                            })
                            .when(!view.sprint.is_empty(), |d| {
                                d.child(chip("clock", view.sprint.clone()))
                            })
                            .child(div().flex_1())
                            .child(
                                div()
                                    .min_w_0()
                                    .max_w(px(132.))
                                    .flex()
                                    .items_center()
                                    .gap(px(5.))
                                    .text_size(px(11.))
                                    .text_color(content(0.5))
                                    .children(avatar)
                                    .child(div().min_w_0().truncate().child(
                                        if view.assignee.is_empty() {
                                            "Unassigned".to_string()
                                        } else {
                                            view.assignee.clone()
                                        },
                                    )),
                            ),
                    )
                    .on_click(cx.listener(move |this, _, window, cx| {
                        window.focus(&this.focus, cx);
                        this.open_row(key.clone(), cx);
                    })),
            )
            .into_any_element()
    }
}

fn group_header(title: &str, count: usize) -> AnyElement {
    div()
        .h(px(GROUP_HEIGHT))
        .px(px(16.))
        .pt(px(8.))
        .flex()
        .items_center()
        .gap(px(8.))
        .text_size(px(11.))
        .font_weight(FontWeight::SEMIBOLD)
        .text_color(content(0.5))
        .child(div().min_w_0().truncate().child(title.to_string()))
        .child(div().text_color(content(0.3)).child(count.to_string()))
        .into_any_element()
}
