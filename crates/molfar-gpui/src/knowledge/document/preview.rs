//! The note preview: Markdown rows with Obsidian callouts drawn as cards.
use super::callout::{Segment, segments};
use crate::markdown_model::{BlockTree, parse_full_hard_breaks};
use crate::{
    markdown::{self, Tone},
    theme::*,
};
use gpui::{AnyElement, FontWeight, Hsla, div, hsla, prelude::*, px};

/// A note parsed once per edit; frames only lay its rows out.
pub(crate) enum PreviewBlock {
    Markdown(BlockTree),
    Callout {
        kind: String,
        title: String,
        body: BlockTree,
    },
}

pub(crate) fn parse(prepared: &str) -> Vec<PreviewBlock> {
    segments(prepared)
        .into_iter()
        .map(|segment| match segment {
            Segment::Markdown(text) => PreviewBlock::Markdown(parse_full_hard_breaks(&text)),
            Segment::Callout { kind, title, body } => PreviewBlock::Callout {
                kind,
                title,
                body: parse_full_hard_breaks(&body),
            },
        })
        .collect()
}

fn markdown_rows(tree: &BlockTree, prefix: &str, out: &mut Vec<AnyElement>) {
    for block in &tree.blocks {
        for (index, row) in markdown::rows(&block.block).into_iter().enumerate() {
            let id = gpui::SharedString::from(format!(
                "knowledge-markdown-{prefix}-{index}-{}",
                out.len()
            ));
            out.push(markdown::body(
                &row,
                id,
                Tone::Normal,
                None,
                std::time::Instant::now(),
            ));
        }
    }
}

/// Hue and icon per callout family, as Obsidian groups them.
fn style(kind: &str) -> (Option<f32>, &'static str) {
    match kind {
        "tip" | "hint" | "important" | "success" | "check" | "done" => (Some(0.4), "check-circle"),
        "warning" | "caution" | "attention" => (Some(0.1), "alert-circle"),
        "danger" | "error" | "bug" | "failure" | "fail" | "missing" => (Some(0.0), "shield-alert"),
        "question" | "help" | "faq" => (Some(0.76), "message-square"),
        "example" => (Some(0.82), "list-bullet"),
        "abstract" | "summary" | "tldr" => (Some(0.48), "sparkles"),
        "quote" | "cite" => (None, "note"),
        _ => (Some(0.58), "note"),
    }
}

fn tint(hue: Option<f32>, alpha: f32) -> Hsla {
    match hue {
        Some(hue) if is_light() => hsla(hue, 0.6, 0.42, alpha),
        Some(hue) => hsla(hue, 0.7, 0.65, alpha),
        None => content(alpha),
    }
}

fn callout(index: usize, kind: &str, title: &str, body: &BlockTree) -> AnyElement {
    let (hue, glyph) = style(kind);
    let mut rows = Vec::new();
    markdown_rows(body, &format!("callout-{index}"), &mut rows);
    div()
        .id(("knowledge-callout", index))
        .debug_selector(move || format!("knowledge-callout-{index}"))
        .mt(px(14.))
        .rounded_lg()
        .border_l_2()
        .border_color(tint(hue, 0.85))
        .bg(tint(hue, 0.07))
        .px_3()
        .py_2()
        .child(
            div()
                .flex()
                .items_center()
                .gap_2()
                .text_size(px(13.))
                .font_weight(FontWeight::SEMIBOLD)
                .text_color(tint(hue, 1.))
                .child(icon(glyph, 14.).text_color(tint(hue, 1.)))
                .child(title.to_string()),
        )
        .children(rows)
        .into_any_element()
}

pub(crate) fn rows(blocks: &[PreviewBlock]) -> Vec<AnyElement> {
    let mut out = Vec::new();
    for (index, block) in blocks.iter().enumerate() {
        match block {
            PreviewBlock::Markdown(tree) => markdown_rows(tree, &index.to_string(), &mut out),
            PreviewBlock::Callout { kind, title, body } => {
                out.push(callout(index, kind, title, body))
            }
        }
    }
    out
}
