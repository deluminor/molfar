use crate::pulse::{self, Rate};
use crate::theme::accent_color;
use gpui::{ElementId, PathBuilder, canvas, div, point, prelude::*, px};
use std::f32::consts::{FRAC_PI_2, TAU};
use std::time::Duration;

const SPINNER_PERIOD: Duration = Duration::from_millis(900);
const SPINNER_SIDE: f32 = 10.;
const SPINNER_ARC: f32 = 0.28;

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
            Rate::Half,
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
