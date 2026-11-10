use super::Knowledge;
use crate::{
    markdown::{self, Tone},
    theme::*,
};
use gpui::{Context, Role, div, prelude::*, px};

impl Knowledge {
    pub(super) fn document(
        &mut self,
        selected: Option<&str>,
        cx: &mut Context<Self>,
    ) -> gpui::AnyElement {
        let Some(path) = selected else {
            return div()
                .flex_1()
                .flex()
                .items_center()
                .justify_center()
                .text_color(content(0.45))
                .child("No notes")
                .into_any_element();
        };
        let note = self.notes.iter().find(|note| note.path == path);
        let title = note
            .map(|note| note.title.clone())
            .unwrap_or_else(|| path.to_string());
        let draft = self.drafts.get(path);
        let conflict = draft.is_some_and(|draft| draft.conflict);
        let dirty = draft.is_some_and(|draft| draft.text != draft.disk);
        let links = note.map(|note| note.links.clone()).unwrap_or_default();
        let backlinks = molfar_core::knowledge::backlinks(&self.notes, path);
        let prepared = self.prepared.clone();
        let preview = self.preview;
        div()
            .flex_1()
            .h_full()
            .min_w_0()
            .flex()
            .flex_col()
            .child(
                div()
                    .px_4()
                    .h(px(44.))
                    .flex()
                    .items_center()
                    .gap_2()
                    .border_b_1()
                    .border_color(content(0.08))
                    .child(div().flex_1().text_size(px(14.)).child(title))
                    .child(self.mode_button("Preview", !preview, cx))
                    .child(self.mode_button("Source", preview, cx))
                    .child(
                        div()
                            .id("knowledge-save")
                            .debug_selector(|| "knowledge-save".into())
                            .role(Role::Button)
                            .aria_label("Save")
                            .cursor_pointer()
                            .px_2()
                            .h(px(28.))
                            .rounded_md()
                            .flex()
                            .items_center()
                            .bg(content(if dirty { 0.14 } else { 0.06 }))
                            .child("Save")
                            .on_click(cx.listener(|this, _, _, cx| this.save(cx))),
                    ),
            )
            .when(conflict, |pane| {
                pane.child(
                    div()
                        .id("knowledge-conflict")
                        .debug_selector(|| "knowledge-conflict".into())
                        .px_4()
                        .py_2()
                        .flex()
                        .items_center()
                        .gap_2()
                        .bg(content(0.06))
                        .text_size(px(12.))
                        .child("changed on disk — Reload")
                        .child(
                            div()
                                .id("knowledge-reload")
                                .debug_selector(|| "knowledge-reload".into())
                                .role(Role::Button)
                                .aria_label("Reload")
                                .cursor_pointer()
                                .child("Reload")
                                .on_click(cx.listener(|this, _, _, cx| this.reload_note(cx))),
                        ),
                )
            })
            .child(
                div()
                    .id(if preview {
                        "knowledge-preview"
                    } else {
                        "knowledge-source"
                    })
                    .debug_selector(|| {
                        if preview {
                            "knowledge-preview"
                        } else {
                            "knowledge-source"
                        }
                        .into()
                    })
                    .flex_1()
                    .min_h_0()
                    .overflow_y_scroll()
                    .px_4()
                    .py_3()
                    .when(preview, |body| body.children(preview_rows(&prepared)))
                    .when(!preview, |body| body.child(self.source.clone())),
            )
            .child(self.relations(&links, &backlinks, cx))
            .into_any_element()
    }

    pub(super) fn mode_button(
        &self,
        label: &'static str,
        other: bool,
        cx: &mut Context<Self>,
    ) -> gpui::AnyElement {
        let id = if label == "Source" {
            "knowledge-source-toggle"
        } else {
            "knowledge-preview-toggle"
        };
        div()
            .id(id)
            .debug_selector(move || id.to_string())
            .role(Role::Button)
            .aria_label(label)
            .cursor_pointer()
            .px_2()
            .h(px(28.))
            .rounded_md()
            .flex()
            .items_center()
            .when(!other, |button| button.bg(content(0.1)))
            .child(label)
            .on_click(cx.listener(move |this, _, _, cx| {
                this.preview = label == "Preview";
                if this.preview
                    && let Some(path) = this.selected.clone()
                {
                    this.prepare(&path, cx);
                }
                cx.notify();
            }))
            .into_any_element()
    }

    pub(super) fn relations(
        &self,
        links: &[molfar_core::knowledge::VaultLink],
        backlinks: &[(String, String)],
        cx: &mut Context<Self>,
    ) -> gpui::AnyElement {
        div()
            .px_4()
            .py_2()
            .border_t_1()
            .border_color(content(0.08))
            .flex()
            .gap_4()
            .text_size(px(12.))
            .child(
                div()
                    .child("Links")
                    .children(links.iter().enumerate().map(|(index, link)| {
                        let resolved = link.clone();
                        let label = link.target.clone();
                        div()
                            .id(("knowledge-link", index))
                            .debug_selector(move || format!("knowledge-link-{index}"))
                            .cursor_pointer()
                            .child(label)
                            .on_click(cx.listener(move |this, _, _, cx| {
                                this.open_resolved(&resolved, cx);
                            }))
                    })),
            )
            .child(
                div()
                    .child("Backlinks")
                    .children(backlinks.iter().enumerate().map(|(index, (path, title))| {
                        let path = path.clone();
                        div()
                            .id(("knowledge-backlink", index))
                            .cursor_pointer()
                            .child(title.clone())
                            .on_click(
                                cx.listener(move |this, _, _, cx| this.open_note(path.clone(), cx)),
                            )
                    })),
            )
            .into_any_element()
    }

    pub(super) fn open_resolved(
        &mut self,
        link: &molfar_core::knowledge::VaultLink,
        cx: &mut Context<Self>,
    ) {
        let Some(path) = self.selected.clone() else {
            return;
        };
        if let molfar_core::knowledge::LinkResolution::Resolved { path } =
            molfar_core::knowledge::resolve_vault_link(
                &molfar_core::knowledge::note_index(&self.notes),
                &path,
                link,
            )
        {
            self.open_note(path, cx);
        }
    }
}

fn preview_rows(prepared: &str) -> Vec<gpui::AnyElement> {
    let mut rows = Vec::new();
    for block in &crate::markdown_model::parse_full_hard_breaks(prepared).blocks {
        for (index, row) in markdown::rows(&block.block).into_iter().enumerate() {
            let id = gpui::SharedString::from(format!("knowledge-markdown-{index}-{}", rows.len()));
            rows.push(markdown::body(
                &row,
                id,
                Tone::Normal,
                None,
                std::time::Instant::now(),
            ));
        }
    }
    rows
}
