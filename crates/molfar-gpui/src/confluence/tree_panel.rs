use super::{View, tree::Row};
use crate::theme::*;
use gpui::{AnyElement, Context, FontWeight, Role, div, prelude::*, px};
use molfar_core::confluence::connector::Kind;

impl View {
    pub(super) fn tree_panel(&self, cx: &mut Context<Self>) -> AnyElement {
        let rows = self.rows();
        div()
            .id("confluence-tree")
            .debug_selector(|| "confluence-tree".into())
            .w(px(264.))
            .flex_shrink_0()
            .border_r_1()
            .border_color(content(0.08))
            .h_full()
            .overflow_y_scroll()
            .track_scroll(&self.tree_scroll)
            .on_scroll_wheel(cx.listener(|this, _, _, cx| this.tree_scrolled(cx)))
            .px_2()
            .py_2()
            .when(rows.is_empty(), |tree| {
                tree.child(
                    div()
                        .p_2()
                        .text_size(px(12.))
                        .text_color(content(0.5))
                        .child(if !self.pending.is_empty() {
                            "Loading content…"
                        } else if self.query.trim().is_empty() {
                            "No content in this space."
                        } else {
                            "No matching pages."
                        }),
                )
            })
            .children(
                rows.into_iter()
                    .enumerate()
                    .map(|(index, row)| self.tree_row(index, row, cx)),
            )
            .into_any_element()
    }

    fn tree_row(&self, index: usize, row: Row, cx: &mut Context<Self>) -> AnyElement {
        let node = row.node;
        let id = node.id.clone();
        let chevron = node.clone();
        let context_node = node.clone();
        let expanded = self.expanded.contains(&node.id);
        let is_container =
            matches!(node.kind, Kind::Page | Kind::Folder) && self.query.trim().is_empty();
        let is_current = self
            .selected_node
            .as_ref()
            .is_some_and(|selected| selected.id == node.id);
        let label = super::render::title(
            &node.title,
            &self.query,
            format!("confluence-tree-title-{id}").into(),
        );
        div()
            .id(("confluence-tree-row", index))
            .debug_selector(move || format!("confluence-tree-row-{id}"))
            .role(Role::Button)
            .aria_label(node.title.clone())
            .flex()
            .items_center()
            .gap_1p5()
            .h(px(30.))
            .pl(px(4. + row.depth as f32 * 14.))
            .pr_1()
            .rounded_md()
            .cursor_pointer()
            .hover(|row| row.bg(content(0.06)))
            .when(index == self.cursor_row || is_current, |row| {
                row.bg(content(0.08)).font_weight(FontWeight::MEDIUM)
            })
            .when(is_container, |row| {
                row.child(
                    crate::settings::widgets::secondary_button(
                        ("confluence-expand", index),
                        if expanded { "Collapse" } else { "Expand" },
                        false,
                        false,
                    )
                    .size(px(19.))
                    .p_0()
                    .justify_center()
                    .child(icon(
                        if expanded {
                            "chevron-down"
                        } else {
                            "chevron-right"
                        },
                        13.,
                    ))
                    .on_click(cx.listener(move |this, _, _, cx| {
                        cx.stop_propagation();
                        if !this.collapse(&chevron.id, cx) {
                            this.expand(&chevron, cx);
                        }
                    })),
                )
            })
            .child(
                icon(
                    if node.kind == Kind::Folder {
                        "folder"
                    } else {
                        "note"
                    },
                    13.,
                )
                .text_color(content(0.5)),
            )
            .child(div().flex_1().min_w_0().overflow_hidden().child(label))
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
