//! The note preview, laid out block by block for reading: spaced headings,
//! real list markers and nesting, working checkboxes, quiet quotes, framed
//! code, vault images, highlights, tag links and foldable Obsidian callouts.
use super::super::Knowledge;
use super::callout::{Segment, segments};
use crate::{
    markdown_model::{Block, BlockTree, parse_full_hard_breaks},
    theme::*,
};
use gpui::{AnyElement, Context, FontWeight, Hsla, Role, div, hsla, prelude::*, px};
use std::{
    path::{Path, PathBuf},
    sync::Arc,
};

mod blocks;
mod image;
mod inline;
mod list;

/// A note parsed once per edit; frames only lay its blocks out.
pub(crate) enum PreviewBlock {
    Markdown(BlockTree),
    Callout {
        kind: String,
        title: String,
        body: Vec<PreviewBlock>,
        fold: Option<bool>,
    },
    Image {
        /// `None` when the file lies outside the vault or the URL is bad.
        path: Option<PathBuf>,
        alt: String,
        width: Option<f32>,
    },
}

/// Parses prepared Markdown; `root` resolves vault images to files.
pub(crate) fn parse(prepared: &str, root: Option<&Path>) -> Vec<PreviewBlock> {
    segments(prepared)
        .into_iter()
        .map(|segment| match segment {
            Segment::Markdown(text) => {
                PreviewBlock::Markdown(decorated(parse_full_hard_breaks(&text)))
            }
            Segment::Callout {
                kind,
                title,
                body,
                fold,
            } => PreviewBlock::Callout {
                kind,
                title,
                body: parse(&body, root),
                fold,
            },
            Segment::Image { url, alt } => {
                let target = molfar_core::knowledge::asset_target(&url);
                let path = target.as_ref().zip(root).and_then(|((relative, _), root)| {
                    molfar_core::knowledge::asset_path(root, relative)
                        .inspect_err(|error| log::warn!("knowledge image {relative}: {error}"))
                        .ok()
                });
                PreviewBlock::Image {
                    path,
                    alt,
                    width: target.and_then(|(_, width)| width),
                }
            }
        })
        .collect()
}

fn decorate_block(block: &mut Block) {
    match block {
        Block::Paragraph { runs } | Block::Heading { runs, .. } => *runs = inline::decorate(runs),
        Block::List { items, .. } => items.iter_mut().flatten().for_each(decorate_block),
        Block::BlockQuote { children } => children.iter_mut().for_each(decorate_block),
        Block::Table { header, rows, .. } => {
            for cell in header.iter_mut().chain(rows.iter_mut().flatten()) {
                *cell = inline::decorate(cell);
            }
        }
        _ => {}
    }
}

fn decorated(mut tree: BlockTree) -> BlockTree {
    for top in &mut tree.blocks {
        decorate_block(&mut Arc::make_mut(top).block);
    }
    tree
}

/// Running counters while walking a note: tasks are numbered in document
/// order to match [`molfar_core::knowledge::toggle_task`], and every element
/// gets a unique id.
#[derive(Default)]
pub(super) struct Walk {
    pub tasks: usize,
    pub callouts: usize,
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
        self.preview_elements(&self.preview_blocks, &mut Walk::default(), cx)
    }

    fn preview_elements(
        &self,
        blocks: &[PreviewBlock],
        walk: &mut Walk,
        cx: &mut Context<Self>,
    ) -> Vec<AnyElement> {
        let mut out = Vec::new();
        for block in blocks {
            match block {
                PreviewBlock::Markdown(tree) => {
                    for top in &tree.blocks {
                        let first = out.is_empty();
                        out.push(self.block(&top.block, first, walk, cx));
                    }
                }
                PreviewBlock::Callout {
                    kind,
                    title,
                    body,
                    fold,
                } => {
                    let first = out.is_empty();
                    out.push(self.callout(kind, title, body, *fold, first, walk, cx));
                }
                PreviewBlock::Image { path, alt, width } => {
                    let first = out.is_empty();
                    out.push(image::image(path.as_deref(), alt, *width, first, walk, cx));
                }
            }
        }
        out
    }

    #[allow(clippy::too_many_arguments)]
    fn callout(
        &self,
        kind: &str,
        title: &str,
        body: &[PreviewBlock],
        fold: Option<bool>,
        first: bool,
        walk: &mut Walk,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        walk.callouts += 1;
        let index = walk.callouts;
        let (hue, glyph) = style(kind);
        let toggled = self.callouts_toggled.contains(&index);
        let folded = fold.is_some_and(|folded| folded != toggled);
        let foldable = fold.is_some();
        // Folded bodies still count their tasks so later checkboxes keep
        // their document order.
        let children = self.preview_elements(body, walk, cx);

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
