//! The Inbox list pane for Confluence: space switcher, search and a
//! virtualized page tree.
use super::{super::View, Row};
use crate::theme::*;
use gpui::{
    AnyElement, Context, FontWeight, HighlightStyle, Role, SharedString, StyledText, div,
    prelude::*, px, uniform_list,
};
use molfar_core::confluence::connector::Kind;

const ROW_HEIGHT: f32 = 28.;
const INDENT: f32 = 16.;

impl View {
    pub(crate) fn tree_pane(&mut self, cx: &mut Context<Self>) -> AnyElement {
        div()
            .id("confluence-tree-pane")
            .debug_selector(|| "confluence".into())
            .track_focus(&self.focus)
            .key_context("Confluence")
            .capture_key_down(cx.listener(Self::key_down))
            .flex_1()
            .min_h_0()
            .flex()
            .flex_col()
            .child(if self.connected {
                div()
                    .flex_1()
                    .min_h_0()
                    .flex()
                    .flex_col()
                    .child(self.header(cx))
                    .child(self.tree(cx))
                    .into_any_element()
            } else if self.busy {
                super::super::page::center("Loading Confluence…").into_any_element()
            } else {
                self.hero(cx)
            })
            .into_any_element()
    }

    fn tree(&mut self, cx: &mut Context<Self>) -> AnyElement {
        let count = self.tree_rows.len();
        if count == 0 {
            return div()
                .px_3()
                .py_3()
                .text_size(px(12.))
                .text_color(content(0.45))
                .child(if !self.pending.is_empty() {
                    "Loading pages…"
                } else if self.query.trim().is_empty() {
                    "No pages in this space."
                } else {
                    "No matching pages."
                })
                .into_any_element();
        }

        let entity = cx.entity();
        uniform_list("confluence-tree", count, move |range, window, cx| {
            entity.update(cx, |this, cx| {
                let focused = this.focus.contains_focused(window, cx);
                if let Some(parent) = this.page_candidate(range.clone()) {
                    cx.defer_in(window, move |this, _, cx| this.page_branch(parent, cx));
                }
                range
                    .filter_map(|index| {
                        let row = this.tree_rows.get(index)?.clone();
                        Some(this.tree_row(index, row, focused, cx))
                    })
                    .collect::<Vec<_>>()
            })
        })
        .debug_selector(|| "confluence-tree".into())
        .track_scroll(&self.tree_scroll)
        .flex_1()
        .min_h_0()
        .px_1p5()
        .py_1()
        .into_any_element()
    }

    fn tree_row(
        &self,
        index: usize,
        row: Row,
        focused: bool,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let node = row.node;
        let id = node.id.clone();
        let chevron = node.clone();
        let context_node = node.clone();
        let expanded = self.expanded.contains(&node.id);
        let searching = !self.query.trim().is_empty();
        let container = matches!(node.kind, Kind::Page | Kind::Folder) && !searching;
        let loading = expanded && self.pending.contains(&node.id);
        let current = self
            .selected_node
            .as_ref()
            .is_some_and(|selected| selected.id == node.id);
        let cursor = index == self.cursor_row && focused;
        let glyph = match (node.kind, expanded) {
            (Kind::Folder, true) => "folder-open",
            (Kind::Folder, false) => "folder",
            _ => "file",
        };

        div()
            .id(("confluence-tree-row", index))
            .debug_selector(move || format!("confluence-tree-row-{id}"))
            .role(Role::TreeItem)
            .aria_label(node.title.clone())
            .aria_selected(current)
            .when(container, |row| row.aria_expanded(expanded))
            .w_full()
            .h(px(ROW_HEIGHT))
            .pl(px(4. + row.depth as f32 * INDENT))
            .pr_2()
            .flex()
            .items_center()
            .gap_1()
            .rounded_md()
            .cursor_pointer()
            .text_size(px(13.))
            .text_color(content(if current { 1. } else { 0.75 }))
            .when(current, |row| {
                row.bg(accent_color().opacity(0.14))
                    .font_weight(FontWeight::MEDIUM)
            })
            .when(!current && cursor, |row| row.bg(content(0.08)))
            .when(!current, |row| row.hover(|row| row.bg(content(0.06))))
            .child(
                div()
                    .id(("confluence-expand", index))
                    .size(px(18.))
                    .flex_shrink_0()
                    .flex()
                    .items_center()
                    .justify_center()
                    .rounded(px(4.))
                    .when(container, |toggle| {
                        toggle
                            .role(Role::Button)
                            .aria_label(if expanded { "Collapse" } else { "Expand" })
                            .hover(|toggle| toggle.bg(content(0.1)))
                            .child(
                                icon(
                                    match (loading, expanded) {
                                        (true, _) => "loader",
                                        (false, true) => "chevron-down",
                                        (false, false) => "chevron-right",
                                    },
                                    12.,
                                )
                                .text_color(content(0.4)),
                            )
                            .on_click(cx.listener(move |this, _, _, cx| {
                                cx.stop_propagation();
                                if !this.collapse(&chevron.id, cx) {
                                    this.expand(&chevron, cx);
                                }
                            }))
                    }),
            )
            .child(icon(glyph, 14.).text_color(if current {
                accent_color()
            } else {
                content(0.45)
            }))
            .child(
                div()
                    .id(("confluence-tree-title", index))
                    .debug_selector({
                        let id = node.id.clone();
                        move || format!("confluence-tree-title-{id}")
                    })
                    .flex_1()
                    .min_w_0()
                    .truncate()
                    .child(highlighted(&node.title, &self.query))
                    .tooltip(crate::tooltip::text(node.title.clone())),
            )
            .on_mouse_down(
                gpui::MouseButton::Right,
                cx.listener(move |this, event: &gpui::MouseDownEvent, window, cx| {
                    this.node_menu(Some(context_node.clone()), event.position, window, cx);
                    cx.stop_propagation();
                }),
            )
            .on_click(cx.listener(move |this, _, window, cx| {
                window.focus(&this.focus, cx);
                this.cursor_row = index;
                this.select_node(node.clone(), cx);
            }))
            .into_any_element()
    }
}

/// One line of title text with the search query marked, never wrapping.
fn highlighted(title: &str, query: &str) -> StyledText {
    let title: SharedString = title
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .into();
    let needle = query.trim().to_lowercase();
    let lower = title.to_lowercase();
    let ranges: Vec<_> = if needle.is_empty() || lower.len() != title.len() {
        Vec::new()
    } else {
        lower
            .match_indices(&needle)
            .map(|(start, found)| start..start + found.len())
            .collect()
    };
    StyledText::new(title).with_highlights(ranges.into_iter().map(|range| {
        (
            range,
            HighlightStyle {
                background_color: Some(accent_color().opacity(0.25)),
                color: Some(content(1.)),
                ..Default::default()
            },
        )
    }))
}
