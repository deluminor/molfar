use crate::theme::*;
use gpui::{
    Animation, AnimationExt, AnyElement, Div, ElementId, Hsla, PathBuilder, SharedString, Stateful,
    canvas, div, point, prelude::*, px,
};
use std::time::Duration;

const FILL: Duration = Duration::from_millis(700);

pub(crate) fn mono() -> &'static str {
    crate::fonts::familiar()
}

/// Uppercase mono caption above a value.
pub(crate) fn label(text: impl Into<SharedString>) -> Div {
    div()
        .font_family(mono())
        .text_size(px(10.))
        .text_color(content(0.45))
        .truncate()
        .child(text.into().to_uppercase())
}

pub(crate) fn metric(value: impl Into<SharedString>, caption: &'static str, size: f32) -> Div {
    div()
        .min_w_0()
        .flex()
        .flex_col()
        .gap_1()
        .child(label(caption))
        .child(
            div()
                .font_family(mono())
                .text_size(px(size))
                .line_height(px(size * 1.05))
                .text_color(content(0.95))
                .truncate()
                .child(value.into()),
        )
}

/// A thin track whose fill grows in from the left each time Home is revealed.
pub(crate) fn bar(
    id: impl Into<ElementId>,
    fraction: f32,
    color: Hsla,
    animate: bool,
) -> AnyElement {
    let fraction = fraction.clamp(0., 1.);
    let fill = div().h_full().rounded_full().bg(color);
    let fill = if animate {
        fill.with_animation(id, Animation::new(FILL), move |fill, t| {
            fill.w(gpui::relative(fraction * crate::home::motion::ease_out(t)))
        })
        .into_any_element()
    } else {
        fill.w(gpui::relative(fraction)).into_any_element()
    };
    div()
        .h(px(4.))
        .w_full()
        .rounded_full()
        .overflow_hidden()
        .bg(content(0.1))
        .child(fill)
        .into_any_element()
}

/// Filled area plus line of the last values, scaled to 0–100.
pub(crate) fn sparkline(values: Vec<f32>, color: Hsla) -> impl IntoElement {
    canvas(
        |_, _, _| (),
        move |bounds, _, window, _| {
            if values.len() < 2 {
                return;
            }
            let step = bounds.size.width.to_f64() as f32 / (values.len() - 1) as f32;
            let height = bounds.size.height.to_f64() as f32;
            let at = |index: usize, value: f32| {
                bounds.origin
                    + point(
                        px(index as f32 * step),
                        px(height - height * (value.clamp(0., 100.) / 100.)),
                    )
            };

            let mut area = PathBuilder::fill();
            area.move_to(bounds.origin + point(px(0.), px(height)));
            for (index, value) in values.iter().enumerate() {
                area.line_to(at(index, *value));
            }
            area.line_to(bounds.origin + point(bounds.size.width, px(height)));
            area.close();
            if let Ok(area) = area.build() {
                window.paint_path(area, color.opacity(0.14));
            }

            let mut line = PathBuilder::stroke(px(1.5));
            for (index, value) in values.iter().enumerate() {
                if index == 0 {
                    line.move_to(at(index, *value));
                } else {
                    line.line_to(at(index, *value));
                }
            }
            if let Ok(line) = line.build() {
                window.paint_path(line, color.opacity(0.85));
            }
        },
    )
    .size_full()
}

/// A list row that lights its border on hover, like the desktop Home rows.
pub(crate) fn row(id: impl Into<ElementId>) -> Stateful<Div> {
    div()
        .id(id)
        .w_full()
        .min_w_0()
        .h(px(26.))
        .flex_shrink_0()
        .px_1p5()
        .flex()
        .items_center()
        .gap_2()
        .rounded_md()
        .border_1()
        .border_color(gpui::transparent_black())
        .cursor_pointer()
        .font_family(mono())
        .text_size(px(12.))
        .text_color(content(0.85))
        .hover(|style| {
            style
                .border_color(accent_color().opacity(0.25))
                .bg(accent_color().opacity(0.06))
                .text_color(content(1.))
        })
}

pub(crate) fn dot(on: bool) -> Div {
    div().size(px(6.)).flex_shrink_0().rounded_full().bg(if on {
        accent_color()
    } else {
        content(0.2)
    })
}

/// How many fixed-height rows fit in `height`, at least one.
pub(crate) fn fit(height: f32, row: f32) -> usize {
    ((height + 2.) / (row + 2.)).floor().max(1.) as usize
}
