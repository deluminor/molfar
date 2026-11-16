use crate::task_board::controls;
use crate::theme::*;
use gpui::{AnyElement, Div, ElementId, Hsla, Role, SharedString, Stateful, div, prelude::*, px};

/// The card drawer's action area: an optional context line, the lead actions
/// side by side, then quiet utilities with the destructive one pushed right.
#[derive(Default)]
pub(super) struct Footer {
    pub hint: Option<&'static str>,
    pub lead: Vec<AnyElement>,
    pub quiet: Vec<AnyElement>,
    pub end: Option<AnyElement>,
}

impl Footer {
    pub(super) fn render(self) -> AnyElement {
        let has_tail = !self.quiet.is_empty() || self.end.is_some();

        div()
            .id("board-stage-footer")
            .debug_selector(|| "board-stage-footer".into())
            .flex()
            .flex_col()
            .gap_2()
            .when_some(self.hint, |footer, hint| {
                footer.child(
                    div()
                        .flex()
                        .items_start()
                        .gap_1p5()
                        .text_size(px(11.5))
                        .text_color(content(0.55))
                        .child(icon("sparkles", 12.).mt(px(1.)).text_color(accent_color()))
                        .child(div().min_w_0().child(hint)),
                )
            })
            .when(!self.lead.is_empty(), |footer| {
                footer.child(div().flex().flex_wrap().gap_2().children(self.lead))
            })
            .when(has_tail, |footer| {
                footer.child(
                    div()
                        .flex()
                        .items_center()
                        .gap_2()
                        .child(
                            div()
                                .flex_1()
                                .min_w_0()
                                .flex()
                                .flex_wrap()
                                .items_center()
                                .gap_0p5()
                                .ml(px(-8.))
                                .children(self.quiet),
                        )
                        .children(self.end),
                )
            })
            .into_any_element()
    }
}

/// The one filled action: it takes the row's free width.
pub(super) fn lead_button(
    id: impl Into<ElementId>,
    label: impl Into<SharedString>,
) -> Stateful<Div> {
    controls::primary_button(id, label).flex_1().min_w(px(140.))
}

/// A lead action that is not the main one: tinted, never filled.
pub(super) fn tonal_button(
    id: impl Into<ElementId>,
    label: impl Into<SharedString>,
) -> Stateful<Div> {
    let label = label.into();
    div()
        .id(id)
        .role(Role::Button)
        .aria_label(label.clone())
        .focusable()
        .tab_index(0)
        .flex()
        .flex_shrink_0()
        .items_center()
        .justify_center()
        .h(px(28.))
        .px(px(10.))
        .rounded(px(6.))
        .whitespace_nowrap()
        .text_size(px(12.))
        .font_weight(gpui::FontWeight::MEDIUM)
        .bg(content(0.07))
        .text_color(content(0.9))
        .hover(|s| s.bg(content(0.11)).text_color(content(1.)))
        .focus_visible(|s| s.bg(content(0.14)))
        .child(label)
}

/// A small text action with a leading icon, for the utility row.
pub(super) fn quiet_button(
    id: impl Into<ElementId>,
    glyph: &'static str,
    label: impl Into<SharedString>,
) -> Stateful<Div> {
    text_button(
        id,
        glyph,
        label.into(),
        (content(0.55), content(0.95)),
        content(0.06),
    )
}

/// The destructive utility, set apart at the row's end.
pub(super) fn danger_quiet_button(
    id: impl Into<ElementId>,
    glyph: &'static str,
    label: impl Into<SharedString>,
) -> Stateful<Div> {
    let ink = crate::modal::danger(0.9);
    text_button(
        id,
        glyph,
        label.into(),
        (ink, ink),
        crate::modal::danger(0.1),
    )
}

fn text_button(
    id: impl Into<ElementId>,
    glyph: &'static str,
    label: SharedString,
    (ink, hover_ink): (Hsla, Hsla),
    hover_fill: Hsla,
) -> Stateful<Div> {
    div()
        .id(id)
        .role(Role::Button)
        .aria_label(label.clone())
        .focusable()
        .tab_index(0)
        .flex_shrink_0()
        .h(px(26.))
        .px(px(8.))
        .rounded(px(6.))
        .flex()
        .items_center()
        .gap_1p5()
        .whitespace_nowrap()
        .text_size(px(12.))
        .text_color(ink)
        .hover(move |s| s.bg(hover_fill).text_color(hover_ink))
        .focus_visible(|s| s.bg(content(0.1)))
        .child(icon(glyph, 13.).text_color(ink.opacity(0.8)))
        .child(label)
}
