use crate::{pulse, theme::accent_color};
use gpui::{Hsla, Path, PathBuilder, Pixels, Point, canvas, div, point, prelude::*, px};
use std::f32::consts::{FRAC_PI_2, TAU};
use std::time::Duration;

const SPINNER_PERIOD: Duration = Duration::from_millis(900);
const SPINNER_SIDE: f32 = 10.;
const SPINNER_ARC: f32 = 0.28;

fn arc(center: Point<Pixels>, from: f32, sweep: f32, color: Hsla) -> Option<(Path<Pixels>, Hsla)> {
    let radius = SPINNER_SIDE / 2. - 1.;
    let mut path = PathBuilder::stroke(px(1.5));
    let steps = 24;

    for index in 0..=steps {
        let angle = from + sweep * index as f32 / steps as f32;
        let point = center + point(px(radius * angle.cos()), px(radius * angle.sin()));
        if index == 0 {
            path.move_to(point);
        } else {
            path.line_to(point);
        }
    }

    path.build().ok().map(|path| (path, color))
}

pub(super) fn running_spinner(card_id: &str) -> impl IntoElement {
    let selector = format!("board-card-spinner-{card_id}");
    div()
        .size(px(SPINNER_SIDE))
        .flex_shrink_0()
        .debug_selector(move || selector)
        .child(
            canvas(
                |_, _, _| (),
                |bounds, _, window, cx| {
                    let center = bounds.center();
                    let color = accent_color();
                    if let Some((path, color)) = arc(center, 0., TAU, color.opacity(0.22)) {
                        window.paint_path(path, color);
                    }
                    pulse::paint_path(bounds, SPINNER_PERIOD, window, cx, move |phase| {
                        arc(center, phase * TAU - FRAC_PI_2, SPINNER_ARC * TAU, color)
                    });
                },
            )
            .size_full(),
        )
}
