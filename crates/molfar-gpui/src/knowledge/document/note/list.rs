//! Lists with real markers and nesting, and task items with checkboxes that
//! write straight back to the note.
use super::{
    Walk,
    blocks::{BODY_LINE, BODY_SIZE, ToggleTask, block},
};
use crate::{
    markdown,
    markdown_model::{Block, InlineRun},
    theme::*,
};
use gpui::{AnyElement, Context, Role, div, prelude::*, px};

const MARKER_WIDTH: f32 = 22.;
const BOX: f32 = 15.;

/// The task state of an item: its first paragraph opens with a marker.
fn task_of(children: &[Block]) -> Option<bool> {
    match children.first()? {
        Block::Paragraph { runs } => runs.first()?.style.task.as_ref().map(|task| task.checked),
        _ => None,
    }
}

/// Checkboxes `block` draws, counted the way [`list`] numbers them.
pub(super) fn tasks_in(block: &Block) -> usize {
    match block {
        Block::List { items, .. } => items
            .iter()
            .map(|children| {
                let task = task_of(children);
                let nested: usize = children
                    .iter()
                    .enumerate()
                    .filter(|(index, child)| {
                        !(*index == 0 && task.is_some() && matches!(child, Block::Paragraph { .. }))
                    })
                    .map(|(_, child)| tasks_in(child))
                    .sum();
                usize::from(task.is_some()) + nested
            })
            .sum(),
        Block::BlockQuote { children } => children.iter().map(tasks_in).sum(),
        _ => 0,
    }
}

fn without_task(runs: &[InlineRun], checked: bool) -> Vec<InlineRun> {
    runs.iter()
        .cloned()
        .map(|mut run| {
            run.style.task = None;
            run.style.strikethrough |= checked;
            run
        })
        .collect()
}

pub(super) fn list<T: 'static>(
    ordered_start: Option<u64>,
    items: &[Vec<Block>],
    walk: &mut Walk,
    toggle: Option<ToggleTask<T>>,
    cx: &mut Context<T>,
) -> AnyElement {
    div()
        .flex()
        .flex_col()
        .gap(px(2.))
        .children(items.iter().enumerate().map(|(position, children)| {
            let task = task_of(children);
            let marker = match (task, ordered_start) {
                (Some(checked), _) => checkbox(checked, walk, toggle, cx),
                (None, Some(start)) => text_marker(format!("{}.", start + position as u64), 0.5),
                (None, None) => text_marker("•".into(), 0.4),
            };
            let body: Vec<AnyElement> = children
                .iter()
                .enumerate()
                .map(|(index, child)| match (index, child, task) {
                    (0, Block::Paragraph { runs }, Some(checked)) => div()
                        .text_size(px(BODY_SIZE))
                        .line_height(px(BODY_LINE))
                        .when(checked, |text| text.opacity(0.5))
                        .child(markdown::inline(
                            &without_task(runs, checked),
                            walk.id("task"),
                            BODY_SIZE,
                        ))
                        .into_any_element(),
                    _ => block(child, index == 0, walk, toggle, cx),
                })
                .collect();
            div()
                .flex()
                .items_start()
                .child(marker)
                .child(div().flex_1().min_w_0().flex().flex_col().children(body))
        }))
        .into_any_element()
}

fn checkbox<T: 'static>(
    checked: bool,
    walk: &mut Walk,
    toggle: Option<ToggleTask<T>>,
    cx: &mut Context<T>,
) -> AnyElement {
    let ordinal = walk.tasks;
    walk.tasks += 1;
    div()
        .w(px(MARKER_WIDTH))
        .h(px(BODY_LINE))
        .flex_shrink_0()
        .flex()
        .items_center()
        .child(
            div()
                .id(("knowledge-task", ordinal))
                .debug_selector(move || format!("knowledge-task-{ordinal}"))
                .role(Role::CheckBox)
                .aria_label(if checked {
                    "Mark as not done"
                } else {
                    "Mark as done"
                })
                .aria_toggled(if checked {
                    gpui::Toggled::True
                } else {
                    gpui::Toggled::False
                })
                .when(toggle.is_some(), |item| item.cursor_pointer())
                .size(px(BOX))
                .rounded(px(4.))
                .flex()
                .items_center()
                .justify_center()
                .when(checked, |box_| box_.bg(accent_color()))
                .when(!checked, |box_| {
                    box_.border_1()
                        .border_color(content(0.3))
                        .hover(|style| style.border_color(accent_color()))
                })
                .when(checked, |box_| {
                    box_.child(icon("check", 11.).text_color(white(1.)))
                })
                .when_some(toggle, |item, toggle| {
                    item.on_click(cx.listener(move |this, _, _, cx| toggle(this, ordinal, cx)))
                }),
        )
        .into_any_element()
}

fn text_marker(text: String, alpha: f32) -> AnyElement {
    div()
        .w(px(MARKER_WIDTH))
        .flex_shrink_0()
        .text_size(px(BODY_SIZE))
        .line_height(px(BODY_LINE))
        .text_color(content(alpha))
        .child(text)
        .into_any_element()
}
