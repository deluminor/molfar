//! The Inbox detail pane for Confluence: breadcrumbs and actions over a
//! virtualized page body, with the outline beside it.
use gpui::{AnyElement, Context, FontWeight, div, list, prelude::*, px};
use molfar_core::knowledge::NoteProperty;

use super::{OpenPage, View};
use crate::{
    knowledge::document::{note::Walk, properties},
    settings::widgets::secondary_button,
    theme::*,
};

/// Element ids inside one block stay unique while blocks render on demand.
const IDS_PER_BLOCK: usize = 10_000;

impl View {
    pub(crate) fn reader_view(&mut self, cx: &mut Context<Self>) -> AnyElement {
        self.sync_document_list();
        div()
            .id("confluence-reader")
            .debug_selector(|| "confluence-reader".into())
            .key_context("Confluence")
            .on_action(cx.listener(|this, action: &OpenPage, _, cx| {
                this.open_page(action.0.clone(), false, cx)
            }))
            .relative()
            .size_full()
            .flex()
            .flex_col()
            .when_some(self.error.clone(), |pane, error| {
                pane.child(self.notice(error, cx))
            })
            .child(self.reader_pane(cx))
            .children(self.context_menu(cx))
            .into_any_element()
    }

    /// Resets the list when another page (or version) is shown, so heights
    /// are measured for the new blocks rather than reused from the last page.
    fn sync_document_list(&mut self) {
        let key = self
            .document
            .as_ref()
            .map(|doc| (doc.page.id.clone(), doc.page.version));
        if key != self.document_key {
            let count = self.document.as_ref().map_or(0, |doc| doc.blocks.len() + 2);
            self.document_list.reset(count);
            self.document_key = key;
        }
    }

    fn reader_pane(&self, cx: &mut Context<Self>) -> AnyElement {
        let pane = div().flex().flex_col().min_w_0().min_h_0().flex_1();
        if self.reading && self.document.is_none() {
            return pane
                .child(div().pt(px(64.)).flex().justify_center().child(
                    crate::knowledge::orbit_loader(
                        "confluence-orbit",
                        "Loading page…".into(),
                        None,
                    ),
                ))
                .into_any_element();
        }
        let Some(doc) = &self.document else {
            return pane.child(self.placeholder()).into_any_element();
        };
        let page = &doc.page;
        let space = self.spaces.iter().find(|space| space.id == page.space_id);
        let ancestors = self.ancestor_nodes(page);
        let breadcrumbs = self.breadcrumbs(
            space.map(|space| space.title.as_str()),
            &ancestors,
            &page.title,
            page.url.clone(),
            cx,
        );
        if let Some(selection) = &self.selection_source {
            return pane
                .child(breadcrumbs)
                .child(
                    div()
                        .px_4()
                        .py_2()
                        .text_size(px(12.))
                        .text_color(content(0.5))
                        .child("Select text, then use Add to chat."),
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

        let entity = cx.entity();
        pane.child(breadcrumbs)
            .child(
                div()
                    .flex()
                    .min_h_0()
                    .flex_1()
                    .child(
                        div()
                            .debug_selector(|| "confluence-document".into())
                            .min_w_0()
                            .flex_1()
                            .h_full()
                            .child(
                                list(self.document_list.clone(), move |ix, _, cx| {
                                    entity.update(cx, |this, cx| this.document_item(ix, cx))
                                })
                                .size_full(),
                            ),
                    )
                    .when(!doc.headings.is_empty(), |body| {
                        body.child(self.outline(doc, cx))
                    }),
            )
            .into_any_element()
    }

    fn document_item(&self, ix: usize, cx: &mut Context<Self>) -> AnyElement {
        let Some(doc) = &self.document else {
            return div().into_any_element();
        };
        let page = doc.page.clone();
        let item = div().px_6().max_w(px(860.));
        if ix == 0 {
            let property = |key: &str, values: Vec<String>, list: bool| NoteProperty {
                key: key.into(),
                values,
                list,
            };
            let card = properties::card(&[
                property("author", vec![page.author.clone()], false),
                property("updated", vec![page.updated.clone()], false),
                property("labels", page.labels.clone(), true),
            ]);
            return item
                .pt_5()
                .child(
                    div()
                        .text_size(px(26.))
                        .text_color(content(1.))
                        .line_height(px(32.))
                        .font_weight(FontWeight::SEMIBOLD)
                        .mb_4()
                        .child(page.title.clone()),
                )
                .children(card)
                .when(doc.blocks.is_empty(), |item| {
                    item.child(center("This page is empty."))
                })
                .into_any_element();
        }
        if let Some(block) = doc.blocks.get(ix - 1) {
            let mut walk = Walk {
                callouts: doc.callout_starts[ix - 1],
                ids: ix * IDS_PER_BLOCK,
                tasks: ix * IDS_PER_BLOCK,
            };
            return item
                .child(self.block_element(block, &page, ix == 1, &mut walk, cx))
                .into_any_element();
        }
        let ancestors = self.ancestor_nodes(&page);
        item.child(self.relations(doc, &ancestors, cx))
            .into_any_element()
    }
}

/// Tests host both panes in one window, as the Inbox does in its two slots.
#[cfg(test)]
impl gpui::Render for View {
    fn render(&mut self, _: &mut gpui::Window, cx: &mut Context<Self>) -> impl IntoElement {
        div()
            .size_full()
            .flex()
            .bg(background_base())
            .child(
                div()
                    .w(px(300.))
                    .h_full()
                    .flex()
                    .flex_col()
                    .border_r_1()
                    .border_color(content(0.07))
                    .child(self.tree_pane(cx)),
            )
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .h_full()
                    .child(self.reader_view(cx)),
            )
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
    secondary_button(
        "confluence-open-in-browser",
        "Open in browser",
        false,
        false,
    )
    .child(icon("external-link", 13.))
    .child("Open in browser")
    .on_click(move |_, _, cx| cx.open_url(&url))
}
