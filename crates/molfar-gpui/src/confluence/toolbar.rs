use gpui::{AnyElement, Context, Focusable, FontWeight, Role, div, prelude::*, px, rgb};

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
            .border_color(content(0.07))
            .child(
                div()
                    .h(px(36.))
                    .px(px(8.))
                    .flex()
                    .items_center()
                    .gap(px(4.))
                    .child(
                        div()
                            .id("confluence-spaces")
                            .role(Role::Button)
                            .aria_label("Choose space")
                            .aria_expanded(self.space_menu)
                            .flex_1()
                            .min_w_0()
                            .h(px(28.))
                            .px(px(8.))
                            .flex()
                            .items_center()
                            .gap(px(6.))
                            .rounded(px(6.))
                            .cursor_pointer()
                            .text_size(px(13.))
                            .font_weight(FontWeight::MEDIUM)
                            .text_color(content(0.9))
                            .when(self.space_menu, |d| d.bg(content(0.08)))
                            .hover(|d| d.bg(content(0.06)))
                            .child(icon("book-open", 14.).text_color(rgb(0x2684ff)))
                            .child(div().flex_1().min_w_0().truncate().child(active.to_owned()))
                            .child(icon("chevrons-up-down", 12.).text_color(content(0.4)))
                            .on_mouse_down(
                                gpui::MouseButton::Right,
                                cx.listener(|this, event: &gpui::MouseDownEvent, window, cx| {
                                    this.node_menu(None, event.position, window, cx);
                                    cx.stop_propagation();
                                }),
                            )
                            .on_click(cx.listener(|this, _, _, cx| {
                                this.space_menu = !this.space_menu;
                                cx.notify();
                            })),
                    )
                    .child(
                        icon_button(
                            "confluence-refresh",
                            "Refresh Confluence",
                            if self.busy { "loader" } else { "refresh-cw" },
                        )
                        .on_click(cx.listener(|this, _, _, cx| this.reload(true, cx))),
                    ),
            );
        if self.space_menu {
            header = header.child(self.space_list(cx));
        }
        header
            .child(
                div()
                    .id("confluence-search-field")
                    .mx(px(8.))
                    .mb(px(8.))
                    .h(px(28.))
                    .px(px(8.))
                    .flex()
                    .items_center()
                    .gap(px(6.))
                    .rounded(px(6.))
                    .border_1()
                    .border_color(content(0.1))
                    .bg(content(0.03))
                    .child(icon("search", 12.).text_color(content(0.4)))
                    .child(div().flex_1().min_w_0().child(self.search.clone()))
                    .on_click(cx.listener(|this, _, window, cx| {
                        window.focus(&this.search.focus_handle(cx), cx)
                    })),
            )
            .into_any_element()
    }
}
