use super::layout::model::WidgetId;
use crate::theme::*;
use gpui::{AnyElement, Div, FontWeight, Role, SharedString, Stateful, div, prelude::*, px};

pub(crate) const CARD_PADDING: f32 = 12.;
pub(crate) const CAPTION_HEIGHT: f32 = 20.;

/// Framed tile with the dashed accent caption shared by every Home widget.
pub(crate) fn card(
    id: WidgetId,
    editing: bool,
    actions: Option<AnyElement>,
    body: AnyElement,
) -> Stateful<Div> {
    div()
        .id(SharedString::from(format!("home-widget-{}", id.key())))
        .role(Role::Region)
        .aria_label(id.label())
        .size_full()
        .min_w_0()
        .min_h_0()
        .flex()
        .flex_col()
        .gap_2()
        .p(px(CARD_PADDING))
        .rounded_lg()
        .border_1()
        .border_color(if editing {
            accent_color().opacity(0.35)
        } else {
            content(0.08)
        })
        .bg(content(0.025))
        .child(caption(id, editing, actions))
        .child(
            div()
                .relative()
                .flex_1()
                .min_h_0()
                .min_w_0()
                .flex()
                .flex_col()
                .child(body),
        )
}

fn caption(id: WidgetId, editing: bool, actions: Option<AnyElement>) -> Div {
    let accent = accent_color();
    div()
        .h(px(CAPTION_HEIGHT))
        .flex_shrink_0()
        .flex()
        .items_center()
        .gap_2()
        .font_family(crate::fonts::familiar())
        .text_size(px(10.))
        .font_weight(FontWeight::MEDIUM)
        .text_color(accent.opacity(0.75))
        .when(editing, |caption| caption.cursor_grab())
        .child(dash(accent.opacity(0.4)).w(px(16.)))
        .child(div().flex_shrink_0().child(id.label().to_uppercase()))
        .child(dash(accent.opacity(0.2)).flex_1())
        .children(actions)
}

fn dash(color: gpui::Hsla) -> Div {
    div()
        .h(px(1.))
        .border_t_1()
        .border_dashed()
        .border_color(color)
}

/// Quiet one-line message for loading, empty and error states.
pub(crate) fn note(text: impl Into<gpui::SharedString>) -> Div {
    div()
        .font_family(crate::fonts::familiar())
        .text_size(px(12.))
        .text_color(content(0.45))
        .child(text.into())
}
