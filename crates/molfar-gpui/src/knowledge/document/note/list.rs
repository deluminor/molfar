//! Lists with real markers and nesting, and task items with checkboxes that
//! write straight back to the note.
use super::super::super::Knowledge;
use super::{
    Walk,
    blocks::{BODY_LINE, BODY_SIZE},
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

impl Knowledge {
    pub(super) fn list(
        &self,
        ordered_start: Option<u64>,
        items: &[Vec<Block>],
        walk: &mut Walk,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        div()
            .flex()
            .flex_col()
            .gap(px(2.))
            .children(items.iter().enumerate().map(|(position, children)| {
                let task = task_of(children);
                let marker = match (task, ordered_start) {
                    (Some(checked), _) => self.checkbox(checked, walk, cx),
                    (None, Some(start)) => {
                        text_marker(format!("{}.", start + position as u64), 0.5)
                    }
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
                        _ => self.block(child, index == 0, walk, cx),
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

    fn checkbox(&self, checked: bool, walk: &mut Walk, cx: &mut Context<Self>) -> AnyElement {
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
                    .cursor_pointer()
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
                    .on_click(cx.listener(move |this, _, _, cx| this.toggle_task(ordinal, cx))),
            )
            .into_any_element()
    }
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
