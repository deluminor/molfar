//! The vault toolbar: tree toggle, vault, search, count and vault actions.
use super::super::Knowledge;
use crate::{right_panel::spinner, theme::*};
use gpui::{AnyElement, Context, FontWeight, Role, div, prelude::*, px};

impl Knowledge {
    pub(in crate::knowledge) fn header(&self, name: &str, cx: &mut Context<Self>) -> AnyElement {
        let notes = crate::right_panel::format_integer(self.notes.len() as i64);
        let refreshing = self.indexing(cx);

        div()
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
                    .items_center()
                    .gap_2()
                    .child(
                        icon_button("knowledge-tree-toggle", "Toggle file tree", "panel-left")
                            .when(self.tree_open, |button| button.bg(content(0.08)))
                            .on_click(cx.listener(|this, _, _, cx| {
                                this.tree_open = !this.tree_open;
                                cx.notify();
                            })),
                    )
                    .child(
                        div()
                            .id("knowledge-vault")
                            .debug_selector(|| "knowledge-vault".into())
                            .h(px(28.))
                            .px_2()
                            .flex()
                            .items_center()
                            .gap_1p5()
                            .rounded_md()
                            .bg(accent_color().opacity(0.1))
                            .child(icon("folder-tree", 13.).text_color(accent_color()))
                            .child(
                                div()
                                    .max_w(px(180.))
                                    .truncate()
                                    .text_size(px(13.))
                                    .font_weight(FontWeight::MEDIUM)
                                    .text_color(content(0.95))
                                    .child(name.to_string()),
                            ),
                    )
                    .child(
                        div()
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
                            .child(div().flex_1().min_w_0().child(self.filter.clone())),
                    )
                    .child(
                        div()
                            .debug_selector(|| "knowledge-count".into())
                            .text_size(px(11.))
                            .text_color(content(0.45))
                            .child(format!("{notes} notes")),
                    )
                    .child(div().flex_1())
                    .child(if refreshing {
                        div()
                            .id("knowledge-refresh")
                            .debug_selector(|| "knowledge-refresh".into())
                            .size(px(28.))
                            .flex()
                            .items_center()
                            .justify_center()
                            .child(spinner("knowledge-refresh-spinner", "refresh-cw", 14.))
                            .into_any_element()
                    } else {
                        icon_button("knowledge-refresh", "Rescan vault", "refresh-cw")
                            .debug_selector(|| "knowledge-refresh".into())
                            .on_click(cx.listener(|this, _, _, cx| this.reload(cx)))
                            .into_any_element()
                    })
                    .child(
                        icon_button("knowledge-change", "Choose another vault", "folder-open")
                            .on_click(cx.listener(|this, _, _, cx| this.choose(cx))),
                    )
                    .child(
                        div()
                            .id("knowledge-disconnect")
                            .debug_selector(|| "knowledge-disconnect".into())
                            .role(Role::Button)
                            .aria_label("Disconnect")
                            .cursor_pointer()
                            .h(px(28.))
                            .px_2()
                            .rounded_md()
                            .flex()
                            .items_center()
                            .gap_1p5()
                            .text_size(px(12.))
                            .text_color(content(0.6))
                            .hover(|style| style.bg(content(0.08)).text_color(content(1.)))
                            .child(icon("logout-01", 13.))
                            .child("Disconnect")
                            .on_click(
                                cx.listener(|this, _, window, cx| this.disconnect(window, cx)),
                            ),
                    ),
            )
            .into_any_element()
    }
}
