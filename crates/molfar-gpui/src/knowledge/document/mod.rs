//! The note panel beside the graph: toolbar, banners, properties, preview or
//! source, and the note's links and backlinks.
use super::Knowledge;
use crate::theme::*;
use gpui::{AnyElement, Context, FontWeight, Hsla, Role, div, hsla, prelude::*, px};

mod callout;
mod note;
mod properties;
mod relations;
mod toolbar;

pub(super) use note::{PreviewBlock, parse as parse_preview};
pub(super) use relations::Relations;

fn banner(
    id: &'static str,
    hue: f32,
    glyph: &'static str,
    text: String,
) -> gpui::Stateful<gpui::Div> {
    let tone: Hsla = if is_light() {
        hsla(hue, 0.65, 0.4, 1.)
    } else {
        hsla(hue, 0.75, 0.68, 1.)
    };
    div()
        .id(id)
        .debug_selector(move || id.to_string())
        .mx_3()
        .mt_2()
        .px_3()
        .py_2()
        .rounded_md()
        .border_1()
        .border_color(tone.opacity(0.3))
        .bg(tone.opacity(0.08))
        .flex()
        .items_center()
        .gap_2()
        .text_size(px(12.))
        .text_color(tone)
        .child(icon(glyph, 14.).text_color(tone))
        .child(div().flex_1().min_w_0().child(text))
}

impl Knowledge {
    pub(super) fn document(&mut self, path: &str, cx: &mut Context<Self>) -> AnyElement {
        let draft = self.drafts.get(path);
        let conflict = draft.is_some_and(|draft| draft.conflict);
        let failure = self
            .error
            .clone()
            .filter(|error| !error.starts_with("CONFLICT:"));
        let preview = self.preview;

        div()
            .id("knowledge-panel")
            .debug_selector(|| "knowledge-panel".into())
            .relative()
            .w(px(self.widths.panel))
            .h_full()
            .flex_shrink_0()
            .min_w_0()
            .flex()
            .flex_col()
            .border_l_1()
            .border_color(content(0.08))
            .bg(content(0.015))
            .child(self.toolbar(path, cx))
            .when_some(failure, |pane, failure| {
                pane.child(banner("knowledge-error", 0.0, "circle-x", failure))
            })
            .when(conflict, |pane| {
                pane.child(
                    banner(
                        "knowledge-conflict",
                        0.1,
                        "alert-circle",
                        "This note changed on disk. Your edits are kept as a draft.".into(),
                    )
                    .child(
                        div()
                            .id("knowledge-reload")
                            .debug_selector(|| "knowledge-reload".into())
                            .role(Role::Button)
                            .aria_label("Reload")
                            .cursor_pointer()
                            .px_2()
                            .h(px(22.))
                            .flex()
                            .items_center()
                            .rounded_sm()
                            .font_weight(FontWeight::MEDIUM)
                            .hover(|style| style.bg(content(0.08)))
                            .child("Reload from disk")
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
                    .debug_selector(move || {
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
                    .px_6()
                    .pt_5()
                    .pb_8()
                    .when(preview, |body| {
                        body.children(properties::card(&self.properties))
                            .children(self.note_blocks(cx))
                    })
                    .when(!preview, |body| body.child(self.source.clone())),
            )
            .child(self.relations(cx))
            .child(self.resize_handle(super::panes::Side::Panel, cx))
            .into_any_element()
    }
}
