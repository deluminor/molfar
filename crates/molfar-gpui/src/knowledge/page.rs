use super::Knowledge;
use crate::theme::*;
use gpui::{Context, Role, div, prelude::*, px};
use molfar_core::knowledge::VaultNote;

impl Knowledge {
    pub(super) fn message(
        &self,
        text: &str,
        reason: Option<String>,
        cx: &mut Context<Self>,
    ) -> gpui::AnyElement {
        div()
            .id("knowledge-empty")
            .debug_selector(|| "knowledge-empty".into())
            .size_full()
            .flex()
            .flex_col()
            .items_center()
            .justify_center()
            .gap_3()
            .child(icon("folder-tree", 28.).text_color(content(0.45)))
            .child(
                div()
                    .text_size(px(16.))
                    .text_color(content(0.8))
                    .child(text.to_string()),
            )
            .children(reason.map(|reason| {
                div()
                    .id("knowledge-reason")
                    .debug_selector(|| "knowledge-reason".into())
                    .max_w(px(420.))
                    .text_size(px(12.))
                    .text_color(content(0.55))
                    .child(reason)
            }))
            .child(
                div()
                    .id("knowledge-choose")
                    .debug_selector(|| "knowledge-choose".into())
                    .role(Role::Button)
                    .aria_label("Choose vault folder")
                    .cursor_pointer()
                    .h(px(32.))
                    .px_3()
                    .rounded_md()
                    .flex()
                    .items_center()
                    .bg(content(0.1))
                    .hover(|style| style.bg(content(0.16)))
                    .text_size(px(13.))
                    .child("Choose vault folder")
                    .on_click(cx.listener(|this, _, _, cx| this.choose(cx))),
            )
            .into_any_element()
    }

    pub(super) fn workspace(&mut self, cx: &mut Context<Self>) -> gpui::AnyElement {
        let notes = self.visible(cx);
        let selected = self.selected.clone();
        div()
            .size_full()
            .flex()
            .child(self.list(&notes, cx))
            .child(self.document(selected.as_deref(), cx))
            .into_any_element()
    }

    pub(super) fn list(&self, notes: &[VaultNote], cx: &mut Context<Self>) -> gpui::AnyElement {
        let selected = self.selected.clone();
        div()
            .id("knowledge-list")
            .debug_selector(|| "knowledge-list".into())
            .w(px(280.))
            .h_full()
            .flex_shrink_0()
            .border_r_1()
            .border_color(content(0.08))
            .flex()
            .flex_col()
            .child(
                div()
                    .px_2()
                    .py_2()
                    .flex()
                    .items_center()
                    .gap_2()
                    .child(self.filter.clone())
                    .child(
                        div()
                            .id("knowledge-refresh")
                            .debug_selector(|| "knowledge-refresh".into())
                            .role(Role::Button)
                            .aria_label("Refresh")
                            .cursor_pointer()
                            .child(icon("refresh-cw", 14.))
                            .on_click(cx.listener(|this, _, _, cx| this.reload(cx))),
                    ),
            )
            .child(
                div()
                    .id("knowledge-notes")
                    .flex_1()
                    .overflow_y_scroll()
                    .px_1()
                    .children(notes.iter().enumerate().map(|(index, note)| {
                        let path = note.path.clone();
                        let active = selected.as_deref() == Some(path.as_str());
                        let folder = note.path.rsplit_once('/').map(|(dir, _)| dir).unwrap_or("");
                        div()
                            .id(("knowledge-note", index))
                            .debug_selector(move || format!("knowledge-note-{index}"))
                            .role(Role::Button)
                            .aria_label(note.path.clone())
                            .cursor_pointer()
                            .w_full()
                            .px_2()
                            .py_1()
                            .rounded_md()
                            .when(active, |row| row.bg(content(0.08)))
                            .hover(|row| row.bg(content(0.06)))
                            .on_click(
                                cx.listener(move |this, _, _, cx| this.open_note(path.clone(), cx)),
                            )
                            .child(
                                div()
                                    .text_size(px(13.))
                                    .text_color(content(0.9))
                                    .child(note.title.clone()),
                            )
                            .child(div().text_size(px(11.)).text_color(content(0.4)).child(
                                if folder.is_empty() {
                                    note.path.clone()
                                } else {
                                    folder.to_string()
                                },
                            ))
                    })),
            )
            .into_any_element()
    }
}
