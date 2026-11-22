use gpui::{AnyElement, Context, div, prelude::*, px};
use molfar_core::confluence::connector::Node;

use super::View;
use crate::theme::*;

impl View {
    pub(super) fn breadcrumbs(
        &self,
        space_title: Option<&str>,
        ancestors: &[Node],
        title: &str,
        url: String,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let crumb = |text: String| {
            div()
                .flex_shrink_1()
                .min_w_0()
                .max_w(px(180.))
                .truncate()
                .child(text)
        };
        div()
            .debug_selector(|| "confluence-breadcrumb".into())
            .flex_shrink_0()
            .h(px(44.))
            .px(px(16.))
            .flex()
            .items_center()
            .gap(px(6.))
            .border_b_1()
            .border_color(content(0.07))
            .text_size(px(12.))
            .text_color(content(0.5))
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .flex()
                    .items_center()
                    .gap(px(6.))
                    .overflow_hidden()
                    .when_some(space_title, |row, space| row.child(crumb(space.to_owned())))
                    .children(ancestors.iter().enumerate().map(|(index, ancestor)| {
                        let id = ancestor.id.clone();
                        let selector = id.clone();
                        div()
                            .id(("confluence-ancestor", index))
                            .debug_selector(move || format!("confluence-breadcrumb-{selector}"))
                            .flex_shrink_1()
                            .min_w_0()
                            .flex()
                            .items_center()
                            .gap(px(6.))
                            .cursor_pointer()
                            .hover(|d| d.text_color(content(1.)))
                            .child(icon("chevron-right", 10.).text_color(content(0.3)))
                            .child(crumb(ancestor.title.clone()))
                            .tooltip(crate::tooltip::text(ancestor.title.clone()))
                            .on_click(
                                cx.listener(move |this, _, _, cx| this.open_target(id.clone(), cx)),
                            )
                    }))
                    .child(icon("chevron-right", 10.).text_color(content(0.3)))
                    .child(
                        div()
                            .min_w_0()
                            .truncate()
                            .text_color(content(0.85))
                            .child(title.to_owned()),
                    ),
            )
            .child(
                icon_button("confluence-copy-link", "Copy MOLFAR link", "link").on_click(
                    cx.listener(|this, _, _, cx| {
                        if this.selected_node.is_some() {
                            this.copy_link(None, cx);
                        } else {
                            this.copy_space(cx);
                        }
                    }),
                ),
            )
            .child(
                icon_button(
                    "confluence-select-text",
                    if self.selection_source.is_some() {
                        "Reading view"
                    } else {
                        "Select text"
                    },
                    "cursor-magic",
                )
                .when(self.selection_source.is_some(), |d| d.bg(content(0.1)))
                .on_click(
                    cx.listener(|this, _, window, cx| this.toggle_selection_source(window, cx)),
                ),
            )
            .child(
                icon_button(
                    "confluence-open-browser",
                    "Open in browser",
                    "external-link",
                )
                .on_click(move |_, _, cx| cx.open_url(&url)),
            )
            .child(
                crate::settings::widgets::secondary_button(
                    "confluence-add-to-chat",
                    "Add to chat",
                    false,
                    false,
                )
                .child(icon("comment-add", 13.))
                .child("Add to chat")
                .on_click(cx.listener(
                    |this, event: &gpui::ClickEvent, window, cx| {
                        this.add_menu(event.position(), window, cx)
                    },
                )),
            )
            .into_any_element()
    }
}
