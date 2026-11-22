//! Small Jira chrome built on the Inbox primitives: lozenges, chips and
//! segmented filter buttons.
use gpui::{Div, FontWeight, Role, SharedString, Stateful, div, prelude::*, px};

use super::style::Tone;
use crate::theme::*;

pub(crate) const ROW_HEIGHT: f32 = 64.;
pub(crate) const GROUP_HEIGHT: f32 = 30.;
pub(crate) const SUBTASK_INDENT: f32 = 18.;

pub(crate) fn lozenge(text: impl Into<SharedString>, tone: Tone) -> Div {
    div()
        .flex_shrink_0()
        .max_w(px(132.))
        .h(px(18.))
        .px(px(6.))
        .flex()
        .items_center()
        .rounded(px(4.))
        .bg(tone.fill())
        .text_color(tone.ink())
        .text_size(px(10.))
        .font_weight(FontWeight::SEMIBOLD)
        .child(div().min_w_0().truncate().child(text.into().to_uppercase()))
}

pub(crate) fn chip(glyph: &'static str, text: impl Into<SharedString>) -> Div {
    div()
        .flex_shrink_0()
        .max_w(px(140.))
        .h(px(18.))
        .px(px(6.))
        .flex()
        .items_center()
        .gap(px(4.))
        .rounded(px(4.))
        .border_1()
        .border_color(content(0.1))
        .text_size(px(10.))
        .text_color(content(0.55))
        .child(icon(glyph, 10.).text_color(content(0.45)))
        .child(div().min_w_0().truncate().child(text.into()))
}

/// One button of a segmented control, styled like the Inbox source tabs.
pub(crate) fn segment(
    id: impl Into<SharedString>,
    label: impl Into<SharedString>,
    hint: impl Into<SharedString>,
    active: bool,
) -> Stateful<Div> {
    div()
        .id(id.into())
        .role(Role::Tab)
        .aria_label(hint.into())
        .aria_selected(active)
        .flex_1()
        .min_w_0()
        .h(px(24.))
        .px(px(6.))
        .flex()
        .items_center()
        .justify_center()
        .rounded(px(6.))
        .text_size(px(12.))
        .cursor_pointer()
        .text_color(content(if active { 1. } else { 0.5 }))
        .when(active, |d| d.bg(content(0.1)))
        .when(!active, |d| d.hover(|s| s.bg(content(0.05))))
        .child(div().min_w_0().truncate().child(label.into()))
}

pub(crate) fn meta_label(text: &'static str) -> Div {
    div()
        .w(px(96.))
        .flex_shrink_0()
        .text_size(px(12.))
        .text_color(content(0.45))
        .child(text)
}

pub(crate) fn section_title(text: impl Into<SharedString>) -> Div {
    div()
        .mt(px(24.))
        .mb(px(8.))
        .flex()
        .items_center()
        .gap(px(8.))
        .text_size(px(11.))
        .font_weight(FontWeight::SEMIBOLD)
        .text_color(content(0.45))
        .child(text.into().to_uppercase())
}
