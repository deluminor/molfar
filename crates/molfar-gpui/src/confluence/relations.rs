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

    pub(super) fn relations(
        &self,
        doc: &DocumentView,
        ancestors: &[Node],
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let links: Vec<_> = ancestors
            .last()
            .map(|node| (node.id.clone(), "Parent", node.title.clone()))
            .into_iter()
            .chain(
                doc.children
                    .iter()
                    .map(|node| (node.id.clone(), "Child", node.title.clone())),
            )
            .chain(
                doc.internal_links
                    .iter()
                    .map(|(id, title)| (id.clone(), "Link", title.clone())),
            )
            .collect();
        if links.is_empty() {
            return div().h(px(32.)).into_any_element();
        }
        div()
            .debug_selector(|| "confluence-relations".into())
            .mt(px(32.))
            .pb(px(32.))
            .child(
                div()
                    .mb(px(8.))
                    .text_size(px(11.))
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(content(0.45))
                    .child("RELATED PAGES"),
            )
            .children(
                links
                    .into_iter()
                    .enumerate()
                    .map(|(index, (id, relation, title))| {
                        let selector = id.clone();
                        div()
                            .id(("confluence-relation", index))
                            .debug_selector(move || format!("confluence-relation-{selector}"))
                            .role(gpui::Role::Link)
                            .h(px(28.))
                            .px(px(8.))
                            .flex()
                            .items_center()
                            .gap(px(8.))
                            .rounded(px(6.))
                            .cursor_pointer()
                            .hover(|d| d.bg(content(0.05)))
                            .text_size(px(12.))
                            .child(
                                div()
                                    .w(px(48.))
                                    .flex_shrink_0()
                                    .text_color(content(0.4))
                                    .child(relation),
                            )
                            .child(icon("file", 12.).text_color(content(0.4)))
                            .child(
                                div()
                                    .flex_1()
                                    .min_w_0()
                                    .truncate()
                                    .text_color(content(0.85))
                                    .child(title),
                            )
                            .on_click(
                                cx.listener(move |this, _, _, cx| this.open_target(id.clone(), cx)),
                            )
                    }),
            )
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
