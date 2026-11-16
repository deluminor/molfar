use super::Input;
use crate::theme::content;
use gpui::{Div, Entity, div, prelude::*, px};

pub(crate) fn form_field(label: &str, input: Entity<Input>, height: f32) -> Div {
    div()
        .flex()
        .flex_col()
        .gap(px(6.))
        .text_size(px(12.))
        .text_color(content(0.65))
        .child(label.to_owned())
        .child(
            div()
                .h(px(height))
                .px(px(10.))
                .py_1()
                .rounded_md()
                .border_1()
                .border_color(content(0.1))
                .bg(content(0.04))
                .child(input),
        )
}
