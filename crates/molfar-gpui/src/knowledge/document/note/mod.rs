//! The note preview, laid out block by block for reading: spaced headings,
//! real list markers and nesting, working checkboxes, quiet quotes, framed
//! code, vault images, highlights, tag links and foldable Obsidian callouts.
use super::callout::{Segment, segments};
use crate::{
    markdown_model::{Block, BlockTree, parse_full_hard_breaks},
    theme::*,
};
use gpui::{Hsla, hsla};
use std::{
    path::{Path, PathBuf},
    sync::Arc,
};

pub(crate) mod blocks;
mod hosted;
pub(crate) mod image;
mod inline;
mod items;
mod list;

pub(crate) use hosted::{PreviewHost, render_preview};
pub(crate) use items::PreviewItems;

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
#[derive(Clone, Copy, Default)]
pub(crate) struct Walk {
    pub tasks: usize,
    pub callouts: usize,
    pub ids: usize,
}

impl Walk {
    pub(crate) fn next_callout(&mut self) -> usize {
        self.callouts += 1;
        self.callouts
    }

    pub(crate) fn id(&mut self, kind: &str) -> gpui::SharedString {
        self.ids += 1;
        format!("knowledge-{kind}-{}", self.ids).into()
    }
}

/// Hue and icon per callout family, as Obsidian groups them.
pub(crate) fn style(kind: &str) -> (Option<f32>, &'static str) {
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

pub(crate) fn tint(hue: Option<f32>, alpha: f32) -> Hsla {
    match hue {
        Some(hue) if is_light() => hsla(hue, 0.6, 0.42, alpha),
        Some(hue) => hsla(hue, 0.7, 0.65, alpha),
        None => content(alpha),
    }
}
