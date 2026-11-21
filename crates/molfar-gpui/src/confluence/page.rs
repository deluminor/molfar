use gpui::{AnyElement, Context, FontWeight, Role, Window, div, prelude::*, px};
use molfar_core::{
    confluence::connector::{Kind, Node},
    knowledge::NoteProperty,
};

use super::{OpenPage, View, render::DocumentView};
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
        if self.reading {
            return pane
                .child(center("Loading Confluence page…"))
                .into_any_element();
        }
        if let Some(doc) = &self.document {
            let page = &doc.page;
            let space = self.spaces.iter().find(|space| space.id == page.space_id);
            let parent = page.parent_id.as_deref().and_then(|id| {
                self.branches
                    .values()
                    .flat_map(|branch| &branch.nodes)
                    .find(|node| node.id == id)
            });
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
                .child(
                    div()
                        .debug_selector(|| "confluence-breadcrumb".into())
                        .flex()
                        .gap_2()
                        .items_center()
                        .px_4()
                        .py_2()
                        .border_b_1()
                        .border_color(content(0.08))
                        .text_size(px(12.))
                        .text_color(content(0.58))
                        .when_some(space, |breadcrumbs, space| {
                            breadcrumbs.child(space.title.clone())
                        })
                        .when_some(parent, |breadcrumbs, parent| {
                            breadcrumbs.child("›").child(parent.title.clone())
                        })
                        .child("›")
                        .child(page.title.clone())
                        .child(div().flex_1())
                        .child(
                            secondary_button("confluence-select-text", "Select text", false, false)
                                .child(if self.selection_source.is_some() {
                                    "Reading view"
                                } else {
                                    "Select text"
                                })
                                .on_click(cx.listener(|this, _, window, cx| {
                                    this.toggle_selection_source(window, cx)
                                })),
                        )
                        .child(open_browser(page.url.clone())),
                )
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
                                .child(self.relations(doc, parent, cx)),
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

    fn outline(&self, doc: &DocumentView, cx: &mut Context<Self>) -> AnyElement {
        let headings = doc.headings.iter().enumerate().map(|(n, (index, title))| {
            let index = *index;
            div()
                .id(("confluence-outline", n))
                .debug_selector(|| "confluence-outline-entry".into())
                .role(Role::Button)
                .cursor_pointer()
                .rounded_md()
                .p_1()
                .text_size(px(12.))
                .text_color(content(0.62))
                .hover(|row| row.bg(content(0.06)))
                .child(title.clone())
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.document_scroll.scroll_to_item(index + 2);
                    cx.notify();
                }))
        });
        div()
            .id("confluence-outline")
            .w(px(168.))
            .flex_shrink_0()
            .overflow_y_scroll()
            .border_l_1()
            .border_color(content(0.08))
            .p_3()
            .child(
                div()
                    .text_size(px(12.))
                    .font_weight(FontWeight::SEMIBOLD)
                    .mb_2()
                    .child("On this page"),
            )
            .children(headings)
            .into_any_element()
    }

    fn relations(
        &self,
        doc: &DocumentView,
        parent: Option<&Node>,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let links = parent
            .into_iter()
            .map(|node| (node.id.clone(), format!("Parent · {}", node.title)))
            .chain(
                doc.children
                    .iter()
                    .filter(|node| node.kind == Kind::Page)
                    .map(|node| (node.id.clone(), format!("Child · {}", node.title))),
            )
            .chain(
                doc.internal_links
                    .iter()
                    .map(|(id, title)| (id.clone(), format!("Link · {title}"))),
            );
        div()
            .debug_selector(|| "confluence-relations".into())
            .mt_6()
            .child(
                div()
                    .text_size(px(13.))
                    .font_weight(FontWeight::SEMIBOLD)
                    .child("Relations"),
            )
            .children(links.enumerate().map(|(index, (id, title))| {
                div()
                    .id(("confluence-relation", index))
                    .cursor_pointer()
                    .text_size(px(12.))
                    .py_1()
                    .text_color(accent_color())
                    .child(title)
                    .on_click(
                        cx.listener(move |this, _, _, cx| this.open_page(id.clone(), false, cx)),
                    )
            }))
            .into_any_element()
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

fn open_browser(url: String) -> gpui::Stateful<gpui::Div> {
    secondary_button("confluence-open-browser", "Open in browser", false, false)
        .child(icon("external-link", 13.))
        .child("Open in browser")
        .on_click(move |_, _, cx| cx.open_url(&url))
}
