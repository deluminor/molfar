use crate::{pulse, theme::*};
use chrono::{Local, Timelike};
use gpui::{Bounds, IntoElement, canvas, fill, point, prelude::*, px, size};

const SEGMENTS: u32 = 12;
const GAP: f32 = 3.;

fn fraction(index: u32, seconds: f32) -> f32 {
    (seconds / 5. - index as f32).clamp(0., 1.)
}

pub(super) fn rail() -> impl IntoElement {
    canvas(
        |_, _, _| (),
        |bounds, _, window, cx| {
            let animate = pulse::request(pulse::Rate::Smooth, window, cx);
            let now = Local::now();
            let seconds = now.second() as f32
                + if animate {
                    now.nanosecond() as f32 / 1_000_000_000.
                } else {
                    0.
                };
            let width = bounds.size.width.to_f64() as f32;
            let edge = ((width - GAP * (SEGMENTS - 1) as f32) / SEGMENTS as f32).max(0.);

            for index in 0..SEGMENTS {
                let at = bounds.origin + point(px(index as f32 * (edge + GAP)), px(0.));
                window.paint_quad(fill(Bounds::new(at, size(px(edge), px(2.))), content(0.12)));
                let progress = fraction(index, seconds);
                if progress > 0. {
                    window.paint_quad(fill(
                        Bounds::new(at, size(px(edge * progress), px(2.))),
                        accent_color().opacity(0.65),
                    ));
                }
            }
        },
    )
    .w_full()
    .h(px(2.))
}

#[cfg(test)]
mod tests {
    use super::fraction;

    #[test]
    fn seconds_rail_fills_continuously_and_resets_at_minute_boundary() {
        assert_eq!(fraction(0, 0.), 0.);
        assert_eq!(fraction(0, 2.5), 0.5);
        assert_eq!(fraction(0, 5.), 1.);
        assert_eq!(fraction(1, 5.), 0.);
        assert_eq!(fraction(11, 57.5), 0.5);
        assert!(fraction(3, 17.001) > fraction(3, 17.));
        for index in 0..12 {
            assert_eq!(fraction(index, 0.), 0.);
        }
    }
}
