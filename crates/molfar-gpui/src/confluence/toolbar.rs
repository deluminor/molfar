use gpui::{AnyElement, Context, Focusable, FontWeight, div, prelude::*, px};

use super::{Event, View};
use crate::{settings::widgets::secondary_button, theme::*};

impl View {
    pub(super) fn hero(&self, cx: &mut Context<Self>) -> AnyElement {
        div()
            .debug_selector(|| "confluence-disconnected".into())
            .flex_1()
            .flex()
            .items_center()
            .justify_center()
            .child(
                div()
                    .flex()
                    .flex_col()
                    .gap_3()
                    .items_center()
                    .child(icon("book-open", 30.).text_color(accent_color()))
                    .child(
                        div()
                            .text_size(px(21.))
                            .font_weight(FontWeight::SEMIBOLD)
                            .child("Confluence"),
                    )
                    .child(
                        div()
                            .text_size(px(13.))
                            .text_color(content(0.55))
                            .child("Connect your Cloud site to browse and read documentation."),
                    )
                    .child(
                        secondary_button("confluence-connect", "Open Connections", false, false)
                            .child("Open Connections")
                            .on_click(cx.listener(|_, _, _, cx| cx.emit(Event::Settings))),
                    ),
            )
            .into_any_element()
    }

    pub(super) fn notice(&self, error: String, cx: &mut Context<Self>) -> AnyElement {
        div()
            .debug_selector(|| "confluence-error".into())
            .mx_3()
            .mt_2()
            .px_3()
            .py_2()
            .rounded_md()
            .bg(content(0.04))
            .flex()
            .gap_2()
            .items_center()
            .text_size(px(12.))
            .child(icon("alert-circle", 14.).text_color(content(0.66)))
            .child(div().flex_1().child(error))
            .child(
                secondary_button("confluence-error-retry", "Retry", false, self.busy)
                    .child("Retry")
                    .on_click(cx.listener(|this, _, _, cx| this.reload(true, cx))),
            )
            .into_any_element()
    }

    pub(super) fn header(&self, cx: &mut Context<Self>) -> AnyElement {
        let active = self
            .active_space()
            .map_or("Choose space", |space| &space.title);
        let mut header = div()
            .flex_shrink_0()
            .flex()
            .flex_col()
            .border_b_1()
            .border_color(content(0.08))
            .child(
                div()
                    .h(px(46.))
                    .px_3()
                    .flex()
                    .gap_2()
                    .items_center()
                    .child(
                        secondary_button("confluence-spaces", "Choose space", false, false)
                            .child(icon("folder-tree", 13.))
                            .child(active.to_owned())
                            .on_mouse_down(
                                gpui::MouseButton::Right,
                                cx.listener(|this, event: &gpui::MouseDownEvent, window, cx| {
                                    this.node_menu(None, event.position, window, cx);
                                    cx.stop_propagation();
                                }),
                            )
                            .child(icon("chevron-down", 12.))
                            .on_click(cx.listener(|this, _, _, cx| {
                                this.space_menu = !this.space_menu;
                                cx.notify();
                            })),
                    )
                    .child(
                        div()
                            .id("confluence-search-field")
                            .w(px(320.))
                            .h(px(28.))
                            .px_2()
                            .flex()
                            .items_center()
                            .gap_1p5()
                            .rounded_md()
                            .border_1()
                            .border_color(content(0.1))
                            .bg(content(0.03))
                            .child(icon("search", 13.).text_color(content(0.4)))
                            .child(div().flex_1().min_w_0().child(self.search.clone()))
                            .on_click(cx.listener(|this, _, window, cx| {
                                window.focus(&this.search.focus_handle(cx), cx)
                            })),
                    )
                    .child(div().flex_1())
                    .when(self.active_space().is_some(), |header| {
                        header
                            .child(
                                icon_button("confluence-copy-link", "Copy MOLFAR link", "link")
                                    .on_click(cx.listener(|this, _, _, cx| {
                                        if this.selected_node.is_some() {
                                            this.copy_link(None, cx);
                                        } else {
                                            this.copy_space(cx);
                                        }
                                    })),
                            )
                            .child(
                                secondary_button(
                                    "confluence-add-to-chat",
                                    "Add to chat",
                                    false,
                                    false,
                                )
                                .child("Add to chat")
                                .on_click(cx.listener(
                                    |this, event: &gpui::ClickEvent, window, cx| {
                                        this.add_menu(event.position(), window, cx)
                                    },
                                )),
                            )
                    })
                    .child(
                        icon_button("confluence-refresh", "Refresh Confluence", "refresh-cw")
                            .on_click(cx.listener(|this, _, _, cx| this.reload(true, cx))),
                    ),
            );
        if self.space_menu {
            header = header.child(
                div()
                    .id("confluence-space-list")
                    .max_h(px(240.))
                    .overflow_y_scroll()
                    .px_3()
                    .py_2()
                    .children(
                        self.spaces
                            .iter()
                            .filter(|space| !self.hidden.contains(&space.id))
                            .cloned()
                            .map(|space| {
                                let id = space.id.clone();
                                let selector = id.clone();
                                div()
                                    .flex()
                                    .items_center()
                                    .h(px(30.))
                                    .gap_2()
                                    .child(
                                        secondary_button(
                                            gpui::SharedString::from(format!(
                                                "confluence-space-{id}"
                                            )),
                                            space.title.clone(),
                                            false,
                                            false,
                                        )
                                        .debug_selector(move || {
                                            format!("confluence-space-{selector}")
                                        })
                                        .child(space.title)
                                        .on_click(
                                            cx.listener(move |this, _, _, cx| {
                                                this.space_menu = false;
                                                this.select_space(Some(id.clone()), false, cx);
                                            }),
                                        ),
                                    )
                                    .child(self.hide_space(space.id, false, cx))
                            }),
                    )
                    .when(
                        self.spaces
                            .iter()
                            .any(|space| self.hidden.contains(&space.id)),
                        |menu| {
                            menu.child(
                                div()
                                    .debug_selector(|| "confluence-hidden-spaces".into())
                                    .px_1()
                                    .py_1()
                                    .text_size(px(11.))
                                    .text_color(content(0.45))
                                    .child("Hidden"),
                            )
                        },
                    )
                    .children(
                        self.spaces
                            .iter()
                            .filter(|space| self.hidden.contains(&space.id))
                            .cloned()
                            .map(|space| {
                                let selector = space.id.clone();
                                div()
                                    .flex()
                                    .items_center()
                                    .h(px(30.))
                                    .gap_2()
                                    .child(
                                        div()
                                            .debug_selector(move || {
                                                format!("confluence-hidden-label-{selector}")
                                            })
                                            .text_size(px(12.))
                                            .text_color(content(0.55))
                                            .child(space.title),
                                    )
                                    .child(self.hide_space(space.id, true, cx))
                            }),
                    ),
            );
        }
        header.into_any_element()
    }

    fn hide_space(
        &self,
        id: String,
        hidden: bool,
        cx: &mut Context<Self>,
    ) -> gpui::Stateful<gpui::Div> {
        let selector = id.clone();
        secondary_button(
            gpui::SharedString::from(format!("confluence-hidden-{id}")),
            if hidden { "Show space" } else { "Hide space" },
            false,
            false,
        )
        .debug_selector(move || {
            format!(
                "confluence-{}-{selector}",
                if hidden { "show" } else { "hide" }
            )
        })
        .child(if hidden { "Show" } else { "Hide" })
        .on_click(cx.listener(move |this, _, _, cx| this.toggle_hidden(id.clone(), cx)))
    }
}
