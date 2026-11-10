//! The folder tree beside the graph, virtualised for large vaults.
use super::super::Knowledge;
use super::model::{TreeRow, rows};
use crate::theme::*;
use gpui::{AnyElement, Context, FontWeight, Role, div, prelude::*, px, uniform_list};

const INDENT: f32 = 14.;

impl Knowledge {
    /// Rebuilds the visible rows; note rows carry their ordinal for ids.
    pub(in crate::knowledge) fn rebuild_tree(&mut self, cx: &gpui::App) {
        let query = self.filter.read(cx).content.to_string();
        let mut ordinal = 0;
        self.tree_rows = rows(&self.notes, &query, &self.collapsed)
            .into_iter()
            .map(|row| {
                let number = matches!(row, TreeRow::Note { .. }).then(|| {
                    ordinal += 1;
                    ordinal - 1
                });
                (row, number)
            })
            .collect();
    }

    fn tree_row(&self, index: usize, cx: &mut Context<Self>) -> Option<AnyElement> {
        let (row, ordinal) = self.tree_rows.get(index)?.clone();
        let base = div()
            .w_full()
            .h(px(28.))
            .pr_2()
            .flex()
            .items_center()
            .gap_1p5()
            .rounded_md()
            .cursor_pointer()
            .text_size(px(13.))
            .hover(|row| row.bg(content(0.06)));

        Some(match row {
            TreeRow::Folder {
                path,
                name,
                depth,
                notes,
                open,
            } => base
                .id(("knowledge-folder", index))
                .debug_selector(move || format!("knowledge-folder-{index}"))
                .role(Role::TreeItem)
                .aria_label(name.clone())
                .aria_expanded(open)
                .pl(px(6. + depth as f32 * INDENT))
                .text_color(content(0.75))
                .child(
                    icon(
                        if open {
                            "chevron-down"
                        } else {
                            "chevron-right"
                        },
                        12.,
                    )
                    .text_color(content(0.35)),
                )
                .child(
                    icon(if open { "folder-open" } else { "folder" }, 14.).text_color(content(0.5)),
                )
                .child(div().flex_1().min_w_0().truncate().child(name))
                .child(
                    div()
                        .text_size(px(11.))
                        .text_color(content(0.3))
                        .child(notes.to_string()),
                )
                .on_click(cx.listener(move |this, _, _, cx| {
                    if !this.collapsed.remove(&path) {
                        this.collapsed.insert(path.clone());
                    }
                    this.rebuild_tree(cx);
                    cx.notify();
                }))
                .into_any_element(),
            TreeRow::Note { path, title, depth } => {
                let ordinal = ordinal.unwrap_or(index);
                let active = self.selected.as_deref() == Some(path.as_str());
                let dirty = self
                    .drafts
                    .get(&path)
                    .is_some_and(|draft| draft.text != draft.disk);
                base.id(("knowledge-note", ordinal))
                    .debug_selector(move || format!("knowledge-note-{ordinal}"))
                    .role(Role::TreeItem)
                    .aria_label(path.clone())
                    .aria_selected(active)
                    .pl(px(24. + depth as f32 * INDENT))
                    .text_color(content(if active { 1. } else { 0.7 }))
                    .when(active, |row| {
                        row.bg(accent_color().opacity(0.14))
                            .font_weight(FontWeight::MEDIUM)
                    })
                    .child(icon("file", 13.).text_color(if active {
                        accent_color()
                    } else {
                        content(0.35)
                    }))
                    .child(div().flex_1().min_w_0().truncate().child(title))
                    .when(dirty, |row| {
                        row.child(div().size(px(6.)).rounded_full().bg(accent_color()))
                    })
                    .on_click(cx.listener(move |this, _, _, cx| this.open_note(path.clone(), cx)))
                    .into_any_element()
            }
        })
    }

    pub(in crate::knowledge) fn tree(&mut self, cx: &mut Context<Self>) -> AnyElement {
        let entity = cx.entity();
        let count = self.tree_rows.len();
        let folders = self
            .tree_rows
            .iter()
            .filter(|(row, _)| matches!(row, TreeRow::Folder { .. }))
            .count();

        div()
            .id("knowledge-list")
            .debug_selector(|| "knowledge-list".into())
            .relative()
            .w(px(self.widths.tree))
            .h_full()
            .flex_shrink_0()
            .flex()
            .flex_col()
            .border_r_1()
            .border_color(content(0.08))
            .child(
                div()
                    .h(px(34.))
                    .px_3()
                    .flex()
                    .items_center()
                    .gap_2()
                    .text_size(px(10.))
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(content(0.4))
                    .child(div().flex_1().child("FILES"))
                    .when(folders > 0, |header| {
                        header.child(
                            icon_button(
                                "knowledge-collapse-all",
                                "Collapse all folders",
                                "fold-vertical",
                            )
                            .on_click(cx.listener(|this, _, _, cx| this.collapse_all(cx))),
                        )
                    }),
            )
            .child(if count == 0 {
                div()
                    .px_3()
                    .py_2()
                    .text_size(px(12.))
                    .text_color(content(0.4))
                    .child("No notes match this search.")
                    .into_any_element()
            } else {
                uniform_list("knowledge-notes", count, move |range, _, cx| {
                    entity.update(cx, |this, cx| {
                        range
                            .filter_map(|index| this.tree_row(index, cx))
                            .collect::<Vec<_>>()
                    })
                })
                .flex_1()
                .min_h_0()
                .px_1p5()
                .into_any_element()
            })
            .child(self.resize_handle(super::super::panes::Side::Tree, cx))
            .into_any_element()
    }

    fn collapse_all(&mut self, cx: &mut Context<Self>) {
        let open: Vec<String> = self
            .tree_rows
            .iter()
            .filter_map(|(row, _)| match row {
                TreeRow::Folder {
                    path, open: true, ..
                } => Some(path.clone()),
                _ => None,
            })
            .collect();
        if open.is_empty() {
            self.collapsed.clear();
        } else {
            self.collapsed.extend(open);
        }
        self.rebuild_tree(cx);
        cx.notify();
    }
}
