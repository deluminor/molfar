use crate::modal;
use gpui::{Div, ElementId, SharedString, Stateful, prelude::*, px};

fn compact(button: Stateful<Div>) -> Stateful<Div> {
    button
        .h(px(32.))
        .px(px(12.))
        .rounded(px(6.))
        .text_size(px(12.))
        .font_weight(gpui::FontWeight::MEDIUM)
}

pub(super) fn primary_button(
    id: impl Into<ElementId>,
    label: impl Into<SharedString>,
) -> Stateful<Div> {
    compact(modal::primary_button(id, label))
}

pub(super) fn ghost_button(
    id: impl Into<ElementId>,
    label: impl Into<SharedString>,
) -> Stateful<Div> {
    compact(modal::ghost_button(id, label))
}

pub(super) fn danger_ghost_button(
    id: impl Into<ElementId>,
    label: impl Into<SharedString>,
) -> Stateful<Div> {
    compact(modal::danger_ghost_button(id, label))
}

struct Hint(SharedString);

impl gpui::Render for Hint {
    fn render(&mut self, _: &mut gpui::Window, _: &mut gpui::Context<Self>) -> impl IntoElement {
        gpui::div()
            .max_w(px(420.))
            .px_3()
            .py_2()
            .rounded_md()
            .bg(crate::theme::floating_fill())
            .text_color(crate::theme::content(1.))
            .border_1()
            .border_color(crate::theme::content(0.1))
            .text_size(px(12.))
            .child(self.0.clone())
    }
}

pub(super) fn hint(text: impl Into<SharedString>, cx: &mut gpui::App) -> gpui::AnyView {
    use gpui::AppContext;
    let text = text.into();
    cx.new(|_| Hint(text)).into()
}
