//! Block layout with a reading rhythm: space above each block by kind,
//! nothing above the first.
use super::super::super::Knowledge;
use super::Walk;
use crate::{
    markdown::{self, Fence, Tone},
    markdown_model::Block,
    theme::*,
};
use gpui::{AnyElement, Context, FontWeight, div, prelude::*, px};

pub(super) const BODY_SIZE: f32 = 14.;
pub(super) const BODY_LINE: f32 = 24.;

/// Size, line height and space above for heading levels 1 to 6.
fn heading_metrics(level: u8) -> (f32, f32, f32) {
    match level {
        1 => (24., 32., 28.),
        2 => (19., 28., 26.),
        3 => (16., 24., 20.),
        _ => (14., 22., 16.),
    }
}

fn gap_above(block: &Block) -> f32 {
    match block {
        Block::Heading { level, .. } => heading_metrics(*level).2,
        Block::Paragraph { .. } => 10.,
        Block::List { .. } => 8.,
        Block::Rule => 18.,
        _ => 14.,
    }
}

impl Knowledge {
    pub(super) fn block(
        &self,
        block: &Block,
        first: bool,
        walk: &mut Walk,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let gap = if first { 0. } else { gap_above(block) };
        let body = match block {
            Block::Heading { level, runs } => {
                let (size, line, _) = heading_metrics(*level);
                div()
                    .text_size(px(size))
                    .line_height(px(line))
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(content(0.96))
                    .when(*level <= 2, |heading| {
                        heading.pb(px(6.)).border_b_1().border_color(content(0.07))
                    })
                    .child(markdown::inline(&bold(runs), walk.id("heading"), size))
                    .into_any_element()
            }
            Block::Paragraph { runs } => paragraph(runs, walk),
            Block::List {
                ordered_start,
                items,
            } => self.list(*ordered_start, items, walk, cx),
            Block::BlockQuote { children } => div()
                .border_l_2()
                .border_color(content(0.16))
                .pl_4()
                .opacity(0.82)
                .children(
                    children
                        .iter()
                        .enumerate()
                        .map(|(index, child)| self.block(child, index == 0, walk, cx)),
                )
                .into_any_element(),
            Block::CodeBlock { language, code }
                if !language
                    .as_deref()
                    .is_some_and(|language| language.eq_ignore_ascii_case("mermaid")) =>
            {
                code_block(language.as_deref().unwrap_or(""), code, walk)
            }
            Block::Rule => div().h(px(1.)).bg(content(0.08)).into_any_element(),
            other => fallback(other, walk),
        };
        div()
            .w_full()
            .min_w_0()
            .pt(px(gap))
            .child(body)
            .into_any_element()
    }
}

fn bold(runs: &[crate::markdown_model::InlineRun]) -> Vec<crate::markdown_model::InlineRun> {
    runs.iter()
        .cloned()
        .map(|mut run| {
            run.style.bold = true;
            run
        })
        .collect()
}

pub(super) fn paragraph(runs: &[crate::markdown_model::InlineRun], walk: &mut Walk) -> AnyElement {
    div()
        .text_size(px(BODY_SIZE))
        .line_height(px(BODY_LINE))
        .child(markdown::inline(runs, walk.id("text"), BODY_SIZE))
        .into_any_element()
}

fn code_block(language: &str, code: &str, walk: &mut Walk) -> AnyElement {
    let fence = Fence::new(language, code.trim_end_matches('\n'));
    let label = match fence.language.as_str() {
        "dataview" | "dataviewjs" => "Dataview query".to_string(),
        "text" => String::new(),
        other => other.to_string(),
    };
    div()
        .rounded_lg()
        .border_1()
        .border_color(content(0.08))
        .bg(content(0.035))
        .overflow_hidden()
        .when(!label.is_empty(), |block| {
            block.child(
                div()
                    .px_3()
                    .pt_2()
                    .text_size(px(11.))
                    .text_color(content(0.42))
                    .child(label),
            )
        })
        .child(
            div()
                .id(walk.id("code"))
                .overflow_x_scroll()
                .py_2()
                .child(markdown::code_lines(
                    &fence,
                    0..fence.lines.len(),
                    None,
                    "",
                    false,
                )),
        )
        .into_any_element()
}

/// Tables, math and diagrams keep the shared Markdown renderer.
fn fallback(block: &Block, walk: &mut Walk) -> AnyElement {
    div()
        .flex()
        .flex_col()
        .children(markdown::rows(block).into_iter().map(|row| {
            markdown::body(
                &row,
                walk.id("rich"),
                Tone::Normal,
                None,
                std::time::Instant::now(),
            )
        }))
        .into_any_element()
}
