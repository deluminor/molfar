use super::super::Knowledge;
use crate::theme::*;
use gpui::{AnyElement, Context, FontWeight, Role, div, prelude::*, px};

impl Knowledge {
    pub(super) fn toolbar(&self, path: &str, cx: &mut Context<Self>) -> AnyElement {
        let title = self
            .notes
            .iter()
            .find(|note| note.path == path)
            .map(|note| note.title.clone())
            .unwrap_or_else(|| path.to_string());
        let folder = path
            .rsplit_once('/')
            .map(|(folder, _)| folder.replace('/', " / "));
        let dirty = self
            .drafts
            .get(path)
            .is_some_and(|draft| draft.text != draft.disk);

        div()
            .h(px(52.))
            .flex_shrink_0()
            .px_4()
            .flex()
            .items_center()
            .gap_2()
            .border_b_1()
            .border_color(content(0.08))
            .child(icon("file", 15.).text_color(accent_color()))
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .flex()
                    .flex_col()
                    .child(
                        div()
                            .truncate()
                            .text_size(px(14.))
                            .font_weight(FontWeight::SEMIBOLD)
                            .text_color(content(0.95))
                            .child(title),
                    )
                    .children(folder.map(|folder| {
                        div()
                            .truncate()
                            .text_size(px(11.))
                            .text_color(content(0.4))
                            .child(folder)
                    })),
            )
            .child(
                div()
                    .flex()
                    .p(px(2.))
                    .rounded_md()
                    .bg(content(0.06))
                    .child(self.mode_button("Preview", cx))
                    .child(self.mode_button("Source", cx)),
            )
            .child(
                div()
                    .id("knowledge-save")
                    .debug_selector(|| "knowledge-save".into())
                    .role(Role::Button)
                    .aria_label("Save")
                    .cursor_pointer()
                    .h(px(26.))
                    .px_2p5()
                    .rounded_md()
                    .flex()
                    .items_center()
                    .gap_1()
                    .text_size(px(12.))
                    .when(dirty, |button| {
                        button
                            .bg(accent_color())
                            .text_color(white(1.))
                            .font_weight(FontWeight::MEDIUM)
                            .hover(|style| style.opacity(0.9))
                            .child("Save")
                    })
                    .when(!dirty, |button| {
                        button
                            .text_color(content(0.45))
                            .hover(|style| style.bg(content(0.06)))
                            .child(icon("check", 12.).text_color(content(0.45)))
                            .child("Saved")
                    })
                    .on_click(cx.listener(|this, _, _, cx| this.save(cx))),
            )
            .child(
                icon_button("knowledge-close-note", "Close note", "x")
                    .debug_selector(|| "knowledge-close-note".into())
                    .on_click(cx.listener(|this, _, _, cx| {
                        this.panel_open = false;
                        this.sync_graph_focus(cx);
                        cx.notify();
                    })),
            )
            .into_any_element()
    }

    fn mode_button(&self, label: &'static str, cx: &mut Context<Self>) -> AnyElement {
        let id = if label == "Source" {
            "knowledge-source-toggle"
        } else {
            "knowledge-preview-toggle"
        };
        let active = self.preview == (label == "Preview");
        div()
            .id(id)
            .debug_selector(move || id.to_string())
            .role(Role::Button)
            .aria_label(label)
            .aria_selected(active)
            .cursor_pointer()
            .h(px(22.))
            .px_2()
            .rounded_sm()
            .flex()
            .items_center()
            .text_size(px(12.))
            .text_color(content(if active { 0.95 } else { 0.5 }))
            .when(active, |button| button.bg(floating_fill()).shadow_sm())
            .when(!active, |button| {
                button.hover(|style| style.text_color(content(0.85)))
            })
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
}
