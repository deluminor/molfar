use super::super::Board;
use crate::theme::*;
use gpui::{Context, Role, SharedString, div, prelude::*, px};
use molfar_core::task_board::stage::agent::AgentStage;

pub(super) fn selected_row(
    stage: AgentStage,
    name: &str,
    cx: &mut Context<Board>,
) -> impl IntoElement {
    let remove = name.to_owned();
    let selector = format!("board-column-skill-remove-{name}");
    div()
        .flex()
        .items_center()
        .justify_between()
        .gap_2()
        .h(px(28.))
        .pl_2()
        .pr_1()
        .rounded_md()
        .bg(content(0.05))
        .text_color(content(0.85))
        .child(div().min_w_0().truncate().child(format!("/{name}")))
        .child(
            div()
                .id(SharedString::from(selector.clone()))
                .debug_selector(move || selector.clone())
                .role(Role::Button)
                .aria_label(format!("Remove {name}"))
                .tab_index(0)
                .size(px(20.))
                .flex()
                .items_center()
                .justify_center()
                .rounded_md()
                .cursor_pointer()
                .text_color(content(0.45))
                .hover(|style| style.bg(content(0.08)).text_color(content(1.)))
                .child(icon("x", 12.))
                .on_click(
                    cx.listener(move |this, _, _, cx| this.toggle_column_skill(stage, &remove, cx)),
                ),
        )
}

pub(super) fn available_row(
    stage: AgentStage,
    name: &str,
    cx: &mut Context<Board>,
) -> impl IntoElement {
    let click_name = name.to_owned();
    let key_name = name.to_owned();
    let selector = format!("board-column-skill-{name}");
    div()
        .id(SharedString::from(selector.clone()))
        .debug_selector(move || selector.clone())
        .role(Role::Button)
        .aria_label(format!("Add {name}"))
        .focusable()
        .tab_index(0)
        .cursor_pointer()
        .rounded_md()
        .px_1p5()
        .h(px(26.))
        .flex()
        .items_center()
        .gap_2()
        .text_color(content(0.75))
        .hover(|style| style.bg(content(0.06)).text_color(content(1.)))
        .focus_visible(|style| style.bg(content(0.08)))
        .child(icon("plus", 12.).text_color(content(0.4)))
        .child(div().min_w_0().truncate().child(format!("/{name}")))
        .on_click(
            cx.listener(move |this, _, _, cx| this.toggle_column_skill(stage, &click_name, cx)),
        )
        .on_key_down(cx.listener(move |this, event: &gpui::KeyDownEvent, _, cx| {
            if matches!(event.keystroke.key.as_str(), "space" | "enter") {
                this.toggle_column_skill(stage, &key_name, cx);
                cx.stop_propagation();
            }
        }))
}
