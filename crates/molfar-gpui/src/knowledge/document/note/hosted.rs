//! Lays preview blocks out for any view that hosts them: Knowledge notes,
//! Jira descriptions and comments.
use super::{PreviewBlock, Walk, blocks, blocks::ToggleTask, image, style, tint};
use crate::theme::*;
use gpui::{AnyElement, Context, FontWeight, Role, div, prelude::*, px};

pub(crate) trait PreviewHost: 'static + Sized {
    /// Writes a clicked checkbox back; `None` keeps tasks read-only.
    const TOGGLE_TASK: Option<ToggleTask<Self>> = None;

    fn callout_open(&self, index: usize) -> bool;
    fn toggle_callout(&mut self, index: usize);
}

/// Lays out blocks parsed once with [`super::parse`]; never re-parses per frame.
pub(crate) fn render_preview<T: PreviewHost>(
    host: &T,
    blocks: &[PreviewBlock],
    cx: &mut Context<T>,
) -> Vec<AnyElement> {
    elements(host, blocks, &mut Walk::default(), cx)
}

fn elements<T: PreviewHost>(
    host: &T,
    blocks: &[PreviewBlock],
    walk: &mut Walk,
    cx: &mut Context<T>,
) -> Vec<AnyElement> {
    let mut out = Vec::new();
    for block in blocks {
        let tops = match block {
            PreviewBlock::Markdown(tree) => tree.blocks.len(),
            _ => 1,
        };
        for top in 0..tops {
            let first = out.is_empty();
            out.push(top_element(host, block, top, first, walk, cx));
        }
    }
    out
}

/// One top-level piece: a Markdown tree's `top` block, a callout or an image.
pub(super) fn top_element<T: PreviewHost>(
    host: &T,
    block: &PreviewBlock,
    top: usize,
    first: bool,
    walk: &mut Walk,
    cx: &mut Context<T>,
) -> AnyElement {
    match block {
        PreviewBlock::Markdown(tree) => match tree.blocks.get(top) {
            Some(top) => blocks::block(&top.block, first, walk, T::TOGGLE_TASK, cx),
            None => div().into_any_element(),
        },
        PreviewBlock::Callout {
            kind,
            title,
            body,
            fold,
        } => callout(host, kind, title, body, *fold, first, walk, cx),
        PreviewBlock::Image { path, alt, width } => {
            image::image(path.as_deref(), alt, *width, first, walk, cx)
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn callout<T: PreviewHost>(
    host: &T,
    kind: &str,
    title: &str,
    body: &[PreviewBlock],
    fold: Option<bool>,
    first: bool,
    walk: &mut Walk,
    cx: &mut Context<T>,
) -> AnyElement {
    let index = walk.next_callout();
    let (hue, glyph) = style(kind);
    let folded = fold.is_some_and(|folded| folded != host.callout_open(index));
    let foldable = fold.is_some();
    // Folded bodies still count their tasks so later checkboxes keep their
    // document order.
    let children = elements(host, body, walk, cx);

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
                            this.toggle_callout(index);
                            cx.notify();
                        }))
                }),
        )
        .when(!folded, |card| card.child(div().pt_1().children(children)))
        .into_any_element()
}
