use gpui::{AnyElement, Context, FontWeight, div, prelude::*, px};
use molfar_core::confluence::{
    connector::{Kind, Node},
    page::Page,
};

use super::{View, render::DocumentView};
use crate::theme::*;

impl View {
    pub(super) fn ancestor_nodes(&self, page: &Page) -> Vec<Node> {
        let mut chain = Vec::new();
        let mut id = page.parent_id.clone();
        for _ in 0..16 {
            let Some(current) = id.clone() else {
                break;
            };
            if let Some(node) = self.node_in_tree(&current) {
                id = self
                    .tree_parent(&current)
                    .filter(|parent| !parent.is_empty());
                chain.push(node);
            } else if let Some(node) = self.fetched_ancestor(&current) {
                id = self.fetched_parent(&current);
                chain.push(node);
            } else {
                break;
            }
        }
        chain.reverse();
        chain
    }

    pub(super) fn open_target(&mut self, id: String, cx: &mut Context<Self>) {
        let node = self
            .node_in_tree(&id)
            .or_else(|| self.fetched_ancestor(&id))
            .or_else(|| {
                self.document
                    .as_ref()
                    .and_then(|doc| doc.children.iter().find(|node| node.id == id).cloned())
            });
        if let Some(index) = self.rows().iter().position(|row| row.node.id == id) {
            self.cursor_row = index;
        }
        match node {
            Some(node) if node.kind != Kind::Page => self.select_node(node, cx),
            _ => self.open_page(id, false, cx),
        }
    }

    pub(super) fn breadcrumbs(
        &self,
        space_title: Option<&str>,
        ancestors: &[Node],
        title: &str,
        url: String,
        cx: &mut Context<Self>,
    ) -> AnyElement {
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
            .when_some(space_title, |breadcrumbs, space| {
                breadcrumbs.child(space.to_owned())
            })
            .children(ancestors.iter().enumerate().map(|(index, ancestor)| {
                let id = ancestor.id.clone();
                let selector = id.clone();
                let title = ancestor.title.clone();
                div()
                    .id(("confluence-ancestor", index))
                    .debug_selector(move || format!("confluence-breadcrumb-{selector}"))
                    .flex()
                    .gap_2()
                    .cursor_pointer()
                    .child("›")
                    .child(title)
                    .on_click(cx.listener(move |this, _, _, cx| this.open_target(id.clone(), cx)))
            }))
            .child("›")
            .child(title.to_owned())
            .child(div().flex_1())
            .child(
                crate::settings::widgets::secondary_button(
                    "confluence-select-text",
                    "Select text",
                    false,
                    false,
                )
                .child(if self.selection_source.is_some() {
                    "Reading view"
                } else {
                    "Select text"
                })
                .on_click(
                    cx.listener(|this, _, window, cx| this.toggle_selection_source(window, cx)),
                ),
            )
            .child(super::page::open_browser(url))
            .into_any_element()
    }

    pub(super) fn relations(
        &self,
        doc: &DocumentView,
        ancestors: &[Node],
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let links = ancestors
            .last()
            .map(|node| (node.id.clone(), format!("Parent · {}", node.title)))
            .into_iter()
            .chain(
                doc.children
                    .iter()
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
                let selector = id.clone();
                div()
                    .id(("confluence-relation", index))
                    .debug_selector(move || format!("confluence-relation-{selector}"))
                    .cursor_pointer()
                    .text_size(px(12.))
                    .py_1()
                    .text_color(accent_color())
                    .child(title)
                    .on_click(cx.listener(move |this, _, _, cx| this.open_target(id.clone(), cx)))
            }))
            .into_any_element()
    }

    fn node_in_tree(&self, id: &str) -> Option<Node> {
        self.branches
            .values()
            .flat_map(|branch| &branch.nodes)
            .find(|node| node.id == id)
            .cloned()
    }

    fn tree_parent(&self, id: &str) -> Option<String> {
        self.branches.iter().find_map(|(parent, branch)| {
            branch
                .nodes
                .iter()
                .any(|node| node.id == id)
                .then(|| parent.clone())
        })
    }

    fn fetched_ancestor(&self, id: &str) -> Option<Node> {
        self.document
            .as_ref()
            .and_then(|doc| doc.ancestors.iter().find(|node| node.id == id).cloned())
    }

    fn fetched_parent(&self, id: &str) -> Option<String> {
        let ancestors = &self.document.as_ref()?.ancestors;
        let index = ancestors.iter().position(|node| node.id == id)?;
        index
            .checked_sub(1)
            .map(|index| ancestors[index].id.clone())
    }
}
