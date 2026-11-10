//! The release-notes dialog language shared by every native modal: one
//! frosted panel with a ruled header and footer, and soft list rows that
//! wash in on hover or selection instead of stacking bordered cards.
use super::{BORDER, RADIUS, lift, surface};
use crate::theme::*;
use gpui::{Div, ElementId, FontWeight, Role, SharedString, Stateful, div, prelude::*, px};

const ROW_RADIUS: f32 = 12.;
const INSET: f32 = 20.;

/// The single dialog panel. Callers set height and add header, body and footer.
pub(crate) fn sheet(width: f32) -> Div {
    div()
        .relative()
        .w(px(width))
        .max_w_full()
        .flex()
        .flex_col()
        .overflow_hidden()
        .rounded(px(RADIUS))
        .border_1()
        .border_color(content(BORDER))
        .shadow(lift())
        .text_color(content(1.))
        .child(surface(RADIUS - 1.))
}

/// The ruled title block: title, an optional quiet description, and room
/// for a trailing close button.
pub(crate) fn header(title: impl Into<SharedString>, description: Option<SharedString>) -> Div {
    div()
        .relative()
        .flex_shrink_0()
        .px(px(INSET))
        .py(px(16.))
        .border_b_1()
        .border_color(content(BORDER))
        .flex()
        .items_start()
        .gap(px(12.))
        .child(
            div()
                .flex_1()
                .min_w_0()
                .child(
                    div()
                        .text_size(px(16.))
                        .line_height(px(22.))
                        .font_weight(FontWeight::SEMIBOLD)
                        .child(title.into()),
                )
                .when_some(description, |d, text| {
                    d.child(
                        div()
                            .mt(px(4.))
                            .text_size(px(12.))
                            .line_height(px(17.))
                            .text_color(content(0.6))
                            .child(text),
                    )
                }),
        )
}

/// The header's quiet × button.
pub(crate) fn close_button(id: impl Into<ElementId>) -> Stateful<Div> {
    div()
        .id(id)
        .role(Role::Button)
        .aria_label("Close")
        .cursor_pointer()
        .flex_shrink_0()
        .size(px(24.))
        .rounded(px(6.))
        .flex()
        .items_center()
        .justify_center()
        .text_color(content(0.6))
        .hover(|s| s.bg(content(0.07)).text_color(content(1.)))
        .child(icon("x", 14.))
}

/// The scrolling middle of a [`sheet`].
pub(crate) fn body(id: impl Into<ElementId>) -> Stateful<Div> {
    div()
        .id(id)
        .relative()
        .flex_1()
        .min_h_0()
        .overflow_y_scroll()
        .px(px(INSET))
        .py(px(16.))
        .flex()
        .flex_col()
}

/// The ruled, right-aligned button row closing a [`sheet`].
pub(crate) fn footer() -> Div {
    div()
        .relative()
        .flex_shrink_0()
        .px(px(INSET))
        .py(px(12.))
        .border_t_1()
        .border_color(content(BORDER))
        .flex()
        .justify_end()
        .items_center()
        .gap(px(8.))
}

/// A column of [`row`]s a hairline apart, pulled out to the sheet's inset so
/// row text lines up with the header.
pub(crate) fn list() -> Div {
    div().flex().flex_col().gap(px(1.)).mx(px(-8.))
}

/// A soft list row: no border, a faint wash when `active` (open or
/// selected) and a fainter one on hover. Keyboard focus draws the accent
/// ring.
pub(crate) fn row(id: impl Into<ElementId>, active: bool) -> Stateful<Div> {
    div()
        .id(id)
        .flex()
        .items_start()
        .gap(px(8.))
        .px(px(12.))
        .py(px(10.))
        .rounded(px(ROW_RADIUS))
        .border_1()
        .border_color(content(0.))
        .when(active, |d| d.bg(content(0.04)))
        .when(!active, |d| d.hover(|s| s.bg(content(0.03))))
        .focus_visible(|s| s.border_color(accent_color()))
}

/// The leading tick of a selectable [`row`].
pub(crate) fn check(checked: bool) -> Div {
    div()
        .mt(px(2.))
        .flex_shrink_0()
        .size(px(14.))
        .rounded(px(4.))
        .flex()
        .items_center()
        .justify_center()
        .when(checked, |d| {
            d.bg(content(0.92))
                .text_color(inverse_ink())
                .child(icon("check", 10.))
        })
        .when(!checked, |d| d.border_1().border_color(content(0.25)))
}

fn inverse_ink() -> gpui::Hsla {
    let mut ink = floating_fill();
    ink.a = 1.;
    ink
}

/// A row's primary line.
pub(crate) fn row_title(text: impl Into<SharedString>) -> Div {
    div()
        .text_size(px(13.))
        .line_height(px(18.))
        .font_weight(FontWeight::MEDIUM)
        .child(text.into())
}

/// A row's quiet secondary line.
pub(crate) fn row_meta(text: impl Into<SharedString>) -> Div {
    div()
        .mt(px(2.))
        .text_size(px(12.))
        .line_height(px(17.))
        .text_color(content(0.45))
        .child(text.into())
}

/// A soft, non-interactive grouping inside a sheet: the row wash without a
/// border, for clusters of fields that belong together.
pub(crate) fn group() -> Div {
    div()
        .px(px(12.))
        .py(px(10.))
        .rounded(px(ROW_RADIUS))
        .bg(content(0.03))
}
