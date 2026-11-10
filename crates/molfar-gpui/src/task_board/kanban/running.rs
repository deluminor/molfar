use super::look::CARD_RADIUS;
use crate::pulse::{self, Rate};
use crate::theme::accent_color;
use gpui::{
    Bounds, ElementId, PathBuilder, Pixels, Point, Window, canvas, div, point, prelude::*, px,
};
use std::f32::consts::{FRAC_PI_2, TAU};
use std::time::Duration;

const BORDER_PERIOD: Duration = Duration::from_millis(2_800);
const SPINNER_PERIOD: Duration = Duration::from_millis(900);
const TRAIL: f32 = 0.32;
const TRAIL_STEPS: usize = 28;
const STROKE: f32 = 1.5;
/// The card's own border width; the comet sits on it, not inside it.
const BORDER: f32 = 1.;
const SPINNER_SIDE: f32 = 10.;
const SPINNER_ARC: f32 = 0.28;

/// A point `distance` along a rounded rectangle's outline, clockwise from the
/// end of the top-left corner, wrapping every outline length.
pub(super) fn outline_point(width: f32, height: f32, radius: f32, distance: f32) -> (f32, f32) {
    let radius = radius.min(width / 2.).min(height / 2.);
    let (straight_x, straight_y) = (width - 2. * radius, height - 2. * radius);
    let arc = FRAC_PI_2 * radius;
    let corner = |cx: f32, cy: f32, quarter: f32, along: f32| {
        let angle = (quarter - 1.) * FRAC_PI_2 + along / radius.max(f32::EPSILON);
        (cx + radius * angle.cos(), cy + radius * angle.sin())
    };
    let mut d = distance.rem_euclid(outline_length(width, height, radius));

    for segment in 0..8 {
        let span = if segment % 2 == 0 {
            [straight_x, straight_y][segment / 2 % 2]
        } else {
            arc
        };
        if d <= span || segment == 7 {
            return match segment {
                0 => (radius + d, 0.),
                1 => corner(width - radius, radius, 0., d),
                2 => (width, radius + d),
                3 => corner(width - radius, height - radius, 1., d),
                4 => (width - radius - d, height),
                5 => corner(radius, height - radius, 2., d),
                6 => (0., height - radius - d),
                _ => corner(radius, radius, 3., d),
            };
        }
        d -= span;
    }
    unreachable!("the last segment always returns")
}

pub(super) fn outline_length(width: f32, height: f32, radius: f32) -> f32 {
    let radius = radius.min(width / 2.).min(height / 2.);
    2. * (width - 2. * radius) + 2. * (height - 2. * radius) + TAU * radius
}

/// A comet circling the card's border, its tail fading out behind it.
fn paint_comet(bounds: Bounds<Pixels>, phase: f32, window: &mut Window) {
    let inset = STROKE / 2.;
    let width = f32::from(bounds.size.width) - STROKE;
    let height = f32::from(bounds.size.height) - STROKE;
    if width <= 0. || height <= 0. {
        return;
    }
    let radius = CARD_RADIUS - inset;
    let length = outline_length(width, height, radius);
    let head = phase * length;
    let step = TRAIL * length / TRAIL_STEPS as f32;
    let at = |distance: f32| -> Point<Pixels> {
        let (x, y) = outline_point(width, height, radius, distance);
        bounds.origin + point(px(x + inset), px(y + inset))
    };

    for index in 0..TRAIL_STEPS {
        let start = head - TRAIL * length + index as f32 * step;
        let strength = (index + 1) as f32 / TRAIL_STEPS as f32;
        let mut path = PathBuilder::stroke(px(STROKE));
        path.move_to(at(start));
        for sample in 1..=3 {
            path.line_to(at(start + step * sample as f32 / 3.));
        }
        let mut color = accent_color();
        color.a = strength * strength * 0.95;
        if let Ok(path) = path.build() {
            window.paint_path(path, color);
        }
    }
}

pub(super) fn running_border(card_id: &str) -> impl IntoElement {
    let id = format!("board-card-running-{card_id}");
    let selector = id.clone();
    div()
        .absolute()
        .top(px(-BORDER))
        .left(px(-BORDER))
        .right(px(-BORDER))
        .bottom(px(-BORDER))
        .debug_selector(move || selector)
        .child(pulse::looping(
            ElementId::Name(id.into()),
            BORDER_PERIOD,
            Rate::Smooth,
            |phase| {
                canvas(
                    |_, _, _| (),
                    move |bounds, _, window, _| paint_comet(bounds, phase, window),
                )
                .size_full()
            },
        ))
}

/// A thin ring with a short bright arc turning around it.
pub(super) fn running_spinner(card_id: &str) -> impl IntoElement {
    let id = format!("board-card-spinner-{card_id}");
    let selector = id.clone();
    div()
        .size(px(SPINNER_SIDE))
        .flex_shrink_0()
        .debug_selector(move || selector)
        .child(pulse::looping(
            ElementId::Name(id.into()),
            SPINNER_PERIOD,
            Rate::Smooth,
            |phase| {
                canvas(
                    |_, _, _| (),
                    move |bounds, _, window, _| {
                        let center = bounds.center();
                        let radius = SPINNER_SIDE / 2. - 1.;
                        let start = phase * TAU - FRAC_PI_2;
                        for (from, sweep, alpha) in
                            [(0., TAU, 0.22), (start, SPINNER_ARC * TAU, 1.)]
                        {
                            let mut path = PathBuilder::stroke(px(1.5));
                            let steps = 24;
                            for index in 0..=steps {
                                let angle = from + sweep * index as f32 / steps as f32;
                                let p = center
                                    + point(px(radius * angle.cos()), px(radius * angle.sin()));
                                if index == 0 {
                                    path.move_to(p);
                                } else {
                                    path.line_to(p);
                                }
                            }
                            let mut color = accent_color();
                            color.a = alpha;
                            if let Ok(path) = path.build() {
                                window.paint_path(path, color);
                            }
                        }
                    },
                )
                .size_full()
            },
        ))
}
