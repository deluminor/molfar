//! The note preview, laid out block by block for reading: spaced headings,
//! real list markers and nesting, working checkboxes, quiet quotes, framed
//! code and foldable Obsidian callouts.
use super::super::Knowledge;
use super::callout::{Segment, segments};
use crate::{
    markdown_model::{BlockTree, parse_full_hard_breaks},
    theme::*,
};
use gpui::{AnyElement, Context, FontWeight, Hsla, Role, div, hsla, prelude::*, px};

mod blocks;
mod list;

/// A note parsed once per edit; frames only lay its blocks out.
pub(crate) enum PreviewBlock {
    Markdown(BlockTree),
    Callout {
        kind: String,
        title: String,
        body: BlockTree,
        fold: Option<bool>,
    },
}

pub(crate) fn parse(prepared: &str) -> Vec<PreviewBlock> {
    segments(prepared)
        .into_iter()
        .map(|segment| match segment {
            Segment::Markdown(text) => PreviewBlock::Markdown(parse_full_hard_breaks(&text)),
            Segment::Callout {
                kind,
                title,
                body,
                fold,
            } => PreviewBlock::Callout {
                kind,
                title,
                body: parse_full_hard_breaks(&body),
                fold,
            },
        })
        .collect()
}

/// Running counters while walking a note: tasks are numbered in document
/// order to match [`molfar_core::knowledge::toggle_task`], and every element
/// gets a unique id.
#[derive(Default)]
pub(super) struct Walk {
    pub tasks: usize,
    pub ids: usize,
}

impl Walk {
    pub(super) fn id(&mut self, kind: &str) -> gpui::SharedString {
        self.ids += 1;
        format!("knowledge-{kind}-{}", self.ids).into()
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

impl Knowledge {
    pub(super) fn note_blocks(&self, cx: &mut Context<Self>) -> Vec<AnyElement> {
        let mut walk = Walk::default();
        let mut out = Vec::new();
        for (index, block) in self.preview_blocks.iter().enumerate() {
            match block {
                PreviewBlock::Markdown(tree) => {
                    for top in &tree.blocks {
                        let first = out.is_empty();
                        out.push(self.block(&top.block, first, &mut walk, cx));
                    }
                }
                PreviewBlock::Callout {
                    kind,
                    title,
                    body,
                    fold,
                } => {
                    let first = out.is_empty();
                    out.push(self.callout(index, kind, title, body, *fold, first, &mut walk, cx));
                }
            }
        }
        out
    }

    #[allow(clippy::too_many_arguments)]
    fn callout(
        &self,
        index: usize,
        kind: &str,
        title: &str,
        body: &BlockTree,
        fold: Option<bool>,
        first: bool,
        walk: &mut Walk,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let (hue, glyph) = style(kind);
        let toggled = self.callouts_toggled.contains(&index);
        let folded = fold.is_some_and(|folded| folded != toggled);
        let foldable = fold.is_some();
        // Folded bodies still count their tasks so later checkboxes keep
        // their document order.
        let children: Vec<AnyElement> = body
            .blocks
            .iter()
            .enumerate()
            .map(|(position, top)| self.block(&top.block, position == 0, walk, cx))
            .collect();

        div()
            .id(("knowledge-callout", index))
            .debug_selector(move || format!("knowledge-callout-{index}"))
            .when(!first, |card| card.mt(px(16.)))
            .rounded_lg()
            .border_l_2()
            .border_color(tint(hue, 0.8))
            .bg(tint(hue, 0.06))
            .px_4()
            .py_2p5()
            .child(
                div()
                    .id(("knowledge-callout-title", index))
                    .debug_selector(move || format!("knowledge-callout-title-{index}"))
                    .flex()
                    .items_center()
                    .gap_2()
                    .text_size(px(13.))
                    .line_height(px(22.))
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(tint(hue, 1.))
                    .child(icon(glyph, 14.).text_color(tint(hue, 1.)))
                    .child(div().flex_1().min_w_0().child(title.to_string()))
                    .when(foldable, |header| {
                        header
                            .role(Role::Button)
                            .aria_expanded(!folded)
                            .cursor_pointer()
                            .child(
                                icon(
                                    if folded {
                                        "chevron-right"
                                    } else {
                                        "chevron-down"
                                    },
                                    13.,
                                )
                                .text_color(tint(hue, 0.7)),
                            )
                            .on_click(cx.listener(move |this, _, _, cx| {
                                if !this.callouts_toggled.remove(&index) {
                                    this.callouts_toggled.insert(index);
                                }
                                cx.notify();
                            }))
                    }),
            )
            .when(!folded, |card| card.child(div().pt_1().children(children)))
            .into_any_element()
    }
}
