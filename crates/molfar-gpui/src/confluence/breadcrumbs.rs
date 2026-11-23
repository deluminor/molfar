use gpui::{AnyElement, Context, Div, Stateful, div, prelude::*, px};
use molfar_core::confluence::connector::Node;

use super::View;
use crate::{settings::widgets::secondary_button, theme::*};

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
        let selecting = self.selection_source.is_some();
        let selection_label = if selecting {
            "Reading view"
        } else {
            "Select text"
        };

        div()
            .debug_selector(|| "confluence-breadcrumb".into())
            .flex_shrink_0()
            .min_h(px(44.))
            .px(px(16.))
            .py_1()
            .flex()
            .flex_wrap()
            .justify_end()
            .items_center()
            .gap(px(6.))
            .border_b_1()
            .border_color(content(0.07))
            .text_size(px(12.))
            .text_color(content(0.5))
            .child(
                div()
                    .flex_grow(1.)
                    .flex_basis(px(120.))
                    .min_w_0()
                    .max_w_full()
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
                div()
                    .flex()
                    .flex_wrap()
                    .min_w_0()
                    .max_w_full()
                    .justify_end()
                    .gap(px(6.))
                    .child(
                        action("confluence-copy-link", "Copy link", "link")
                            .tooltip(crate::tooltip::text("Copy MOLFAR link"))
                            .on_click(cx.listener(|this, _, _, cx| {
                                if this.selected_node.is_some() {
                                    this.copy_link(None, cx);
                                } else {
                                    this.copy_space(cx);
                                }
                            })),
                    )
                    .child(
                        action("confluence-select-text", selection_label, "cursor-magic")
                            .when(selecting, |d| d.bg(content(0.1)))
                            .on_click(cx.listener(|this, _, window, cx| {
                                this.toggle_selection_source(window, cx)
                            })),
                    )
                    .child(
                        action(
                            "confluence-open-browser",
                            "Open in browser",
                            "external-link",
                        )
                        .on_click(move |_, _, cx| cx.open_url(&url)),
                    )
                    .child(
                        action("confluence-add-to-chat", "Add to chat", "comment-add").on_click(
                            cx.listener(|this, event: &gpui::ClickEvent, window, cx| {
                                this.add_menu(event.position(), window, cx)
                            }),
                        ),
                    ),
            )
            .into_any_element()
    }
}

fn action(id: &'static str, label: &'static str, glyph: &'static str) -> Stateful<Div> {
    secondary_button(id, label, false, false)
        .debug_selector(|| id.into())
        .child(icon(glyph, 13.))
        .child(
            div()
                .debug_selector(|| format!("{id}-{label}"))
                .child(label),
        )
}
