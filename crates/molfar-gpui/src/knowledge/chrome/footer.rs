//! The status bar: connection, graph totals, index health, drafts and the
//! last scan.
use super::super::Knowledge;
use crate::theme::*;
use gpui::{AnyElement, App, Hsla, div, hsla, prelude::*, px};

fn item(glyph: &'static str, text: String, color: Hsla) -> gpui::Div {
    div()
        .flex()
        .items_center()
        .gap_1()
        .text_color(color)
        .child(icon(glyph, 11.).text_color(color))
        .child(text)
}

impl Knowledge {
    fn status(&self, cx: &App) -> (Hsla, String) {
        if self.error.is_some() {
            return (hsla(0.0, 0.7, 0.58, 1.), "Needs attention".into());
        }
        if self.indexing(cx) {
            let progress = self.service.read(cx).progress();
            return (
                hsla(0.11, 0.85, 0.55, 1.),
                format!("Scanning… {progress} notes"),
            );
        }
        (hsla(0.38, 0.6, 0.48, 1.), "Connected".into())
    }

    pub(in crate::knowledge) fn footer(&self, root: &str, cx: &App) -> AnyElement {
        let (dot, status) = self.status(cx);
        let graph = &self.stats;
        let unsaved = self
            .drafts
            .values()
            .filter(|draft| draft.conflict || draft.text != draft.disk)
            .count();
        let warning = hsla(0.11, 0.85, 0.55, 1.);
        let integer = |value: usize| crate::right_panel::format_integer(value as i64);

        div()
            .id("knowledge-footer")
            .debug_selector(|| "knowledge-footer".into())
            .h(px(28.))
            .flex_shrink_0()
            .px_3()
            .flex()
            .items_center()
            .gap_4()
            .border_t_1()
            .border_color(content(0.08))
            .text_size(px(11.))
            .text_color(content(0.5))
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap_1p5()
                    .child(div().size(px(7.)).rounded_full().bg(dot))
                    .child(status),
            )
            .child(
                div()
                    .min_w_0()
                    .flex_1()
                    .truncate()
                    .text_color(content(0.3))
                    .child(root.to_string()),
            )
            .child(item(
                "share",
                format!(
                    "{} links · {} orphans · {} unresolved",
                    integer(graph.links),
                    integer(graph.orphans),
                    integer(graph.missing + graph.ambiguous)
                ),
                content(0.5),
            ))
            .when(self.meta.truncated, |footer| {
                footer.child(item("alert-circle", "Incomplete index".into(), warning))
            })
            .when(
                !self.meta.warnings.is_empty() && !self.meta.truncated,
                |footer| {
                    footer.child(item(
                        "alert-circle",
                        format!("{} warnings", self.meta.warnings.len()),
                        warning,
                    ))
                },
            )
            .when(unsaved > 0, |footer| {
                footer.child(item(
                    "pencil-edit",
                    format!("{unsaved} unsaved"),
                    accent_color(),
                ))
            })
            .children(self.meta.scanned_at.map(|at| {
                item(
                    "clock",
                    format!("Scanned {}", at.format("%H:%M")),
                    content(0.4),
                )
            }))
            .into_any_element()
    }
}
