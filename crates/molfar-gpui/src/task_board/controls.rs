use crate::modal;
use gpui::{Div, ElementId, SharedString, Stateful, prelude::*, px};

fn compact(button: Stateful<Div>) -> Stateful<Div> {
    button
        .focusable()
        .tab_index(0)
        .focus_visible(|s| s.bg(crate::theme::content(0.12)))
        .h(px(28.))
        .px(px(10.))
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

pub(super) fn model_label(harness: &str, model: &str) -> gpui::SharedString {
    let Some(kind) = molfar_core::provider::Kind::parse(harness) else {
        return model.to_owned().into();
    };
    let native = molfar_core::store::native_model(model, kind.id());
    crate::pickers::cached_model_name(kind, native.as_deref())
}
