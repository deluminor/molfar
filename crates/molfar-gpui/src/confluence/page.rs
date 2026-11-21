use gpui::{AnyElement, Context, FontWeight, Window, div, prelude::*, px};
use molfar_core::{confluence::connector::Kind, knowledge::NoteProperty};

use super::{OpenPage, View};
use crate::{
    knowledge::document::{note::Walk, properties},
    settings::widgets::secondary_button,
    theme::*,
};

impl View {
    pub(super) fn reader_pane(&self, cx: &mut Context<Self>) -> AnyElement {
        let mut pane = div()
            .flex()
            .flex_col()
            .min_w_0()
            .min_h_0()
            .flex_1()
            .h_full();
        if self.reading && self.document.is_none() {
            return pane
                .child(center("Loading Confluence page…"))
                .into_any_element();
        }
        if let Some(doc) = &self.document {
            let page = &doc.page;
            let space = self.spaces.iter().find(|space| space.id == page.space_id);
            let ancestors = self.ancestor_nodes(page);
            let author = NoteProperty {
                key: "author".into(),
                values: vec![page.author.clone()],
                list: false,
            };
            let updated = NoteProperty {
                key: "updated".into(),
                values: vec![page.updated.clone()],
                list: false,
            };
            let labels = NoteProperty {
                key: "labels".into(),
                values: page.labels.clone(),
                list: true,
            };
            let properties = properties::card(&[author, updated, labels]);
            if let Some(selection) = &self.selection_source {
                return pane
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .justify_between()
                            .px_4()
                            .py_2()
                            .child("Select text to add to chat")
                            .child(
                                secondary_button(
                                    "confluence-reading-view",
                                    "Reading view",
                                    false,
                                    false,
                                )
                                .child("Reading view")
                                .on_click(cx.listener(
                                    |this, _, window, cx| this.toggle_selection_source(window, cx),
                                )),
                            ),
                    )
                    .child(
                        div()
                            .id("confluence-selection-source")
                            .min_h_0()
                            .flex_1()
                            .overflow_y_scroll()
                            .px_6()
                            .py_2()
                            .child(selection.clone()),
                    )
                    .into_any_element();
            }
            let mut walk = Walk::default();
            let blocks: Vec<_> = doc
                .blocks
                .iter()
                .enumerate()
                .map(|(index, block)| self.block_element(block, page, index == 0, &mut walk, cx))
                .collect();
            pane = pane
                .child(self.breadcrumbs(
                    space.map(|space| space.title.as_str()),
                    &ancestors,
                    &page.title,
                    page.url.clone(),
                    cx,
                ))
                .child(
                    div()
                        .flex()
                        .min_h_0()
                        .flex_1()
                        .child(
                            div()
                                .id("confluence-document")
                                .debug_selector(|| "confluence-document".into())
                                .min_w_0()
                                .flex_1()
                                .overflow_y_scroll()
                                .track_scroll(&self.document_scroll)
                                .px_6()
                                .pt_5()
                                .pb_8()
                                .child(
                                    div()
                                        .text_size(px(26.))
                                        .font_weight(FontWeight::SEMIBOLD)
                                        .mb_4()
                                        .child(page.title.clone()),
                                )
                                .children(properties)
                                .when(blocks.is_empty(), |body| {
                                    body.child(center("This page is empty."))
                                })
                                .children(blocks)
                                .child(self.relations(doc, &ancestors, cx)),
                        )
                        .when(!doc.headings.is_empty(), |body| {
                            body.child(self.outline(doc, cx))
                        }),
                );
        } else if let Some(node) = &self.selected_node {
            let message = if node.kind == Kind::Folder {
                "Expand folder in the tree to browse its contents.".to_owned()
            } else {
                format!("Open this {} in Confluence to view it.", node.kind.label())
            };
            pane = pane.child(
                div()
                    .px_6()
                    .py_5()
                    .child(node.title.clone())
                    .child(center(message))
                    .child(open_browser(node.url.clone())),
            );
        } else {
            pane = pane.child(center("Choose a page to read."));
        }
        pane.into_any_element()
    }
}

impl gpui::Render for View {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        div()
            .relative()
            .id("confluence")
            .debug_selector(|| "confluence".into())
            .track_focus(&self.focus)
            .key_context("Confluence")
            .capture_key_down(cx.listener(Self::key_down))
            .on_action(cx.listener(|this, action: &OpenPage, _, cx| {
                this.open_page(action.0.clone(), false, cx)
            }))
            .size_full()
            .flex()
            .flex_col()
            .bg(background_base())
            .when_some(self.error.clone(), |main, error| {
                main.child(self.notice(error, cx))
            })
            .child(if self.connected {
                div()
                    .flex()
                    .flex_col()
                    .flex_1()
                    .min_h_0()
                    .child(self.header(cx))
                    .child(
                        div()
                            .flex()
                            .flex_1()
                            .min_h_0()
                            .child(self.tree_panel(cx))
                            .child(self.reader_pane(cx)),
                    )
                    .child(
                        div()
                            .h(px(26.))
                            .px_3()
                            .flex()
                            .items_center()
                            .border_t_1()
                            .border_color(content(0.08))
                            .text_size(px(11.))
                            .text_color(content(0.45))
                            .child("Confluence Cloud"),
                    )
                    .into_any_element()
            } else if self.busy {
                center("Loading Confluence…").into_any_element()
            } else {
                self.hero(cx)
            })
            .children(self.context_menu(cx))
    }
}

pub(super) fn center(text: impl Into<gpui::SharedString>) -> gpui::Div {
    div()
        .flex_1()
        .p_6()
        .flex()
        .items_center()
        .justify_center()
        .text_size(px(13.))
        .text_color(content(0.55))
        .child(text.into())
}

pub(super) fn open_browser(url: String) -> gpui::Stateful<gpui::Div> {
    secondary_button("confluence-open-browser", "Open in browser", false, false)
        .child(icon("external-link", 13.))
        .child("Open in browser")
        .on_click(move |_, _, cx| cx.open_url(&url))
}
