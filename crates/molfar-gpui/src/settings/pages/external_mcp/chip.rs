use super::*;
use gpui::{Div, ElementId, KeyDownEvent, Role, SharedString, Stateful};

pub(super) fn chip(
    id: impl Into<ElementId>,
    label: impl Into<SharedString>,
    on: bool,
    disabled: bool,
    event: SettingsEvent,
    cx: &mut Context<SettingsView>,
) -> Stateful<Div> {
    let label = label.into();
    let keyboard_event = event.clone();
    div()
        .id(id)
        .role(Role::Button)
        .aria_label(format!("{label}, {}", if on { "on" } else { "off" }))
        .flex()
        .flex_shrink_0()
        .items_center()
        .gap(px(6.))
        .h(px(24.))
        .px_2()
        .rounded(px(6.))
        .border_1()
        .text_size(px(12.))
        .text_color(content(if on { 0.9 } else { 0.55 }))
        .border_color(if on { accent(0.55) } else { content(0.12) })
        .when(on, |div| {
            div.bg(accent(0.15))
                .child(icon("check", 11.).text_color(accent(1.)))
        })
        .when(disabled, |div| div.opacity(0.4))
        .when(!disabled, |div| {
            div.cursor_pointer()
                .tab_stop(true)
                .hover(|style| style.border_color(content(0.25)))
                .focus_visible(|style| style.border_2().border_color(accent(1.)))
                .on_click(cx.listener(move |_, _, _, cx| cx.emit(event.clone())))
                .on_key_down(cx.listener(move |_, key: &KeyDownEvent, _, cx| {
                    if matches!(key.keystroke.key.as_str(), "enter" | "space") {
                        cx.emit(keyboard_event.clone());
                        cx.stop_propagation();
                    }
                }))
        })
        .child(label)
}
