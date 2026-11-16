use super::paint::{extent, noise};
use crate::{pulse, theme::*};
use gpui::{
    App, Bounds, Context, Hsla, Pixels, Render, SharedString, TextAlign, TextRun, Window, canvas,
    div, point, prelude::*, px,
};

const GLYPHS: &[u8] = b"01MOLFAR<>/\\*+=#%&@$ABCDEFXYZ";
const FONT: f32 = 12.;
const COLUMN: f32 = 11.;
const ROW: f32 = 14.;
const MAX_COLUMNS: usize = 80;
/// Trail fades in a few steps, so shaped glyphs repeat and hit the line cache.
const FADE_STEPS: f32 = 6.;

/// Its own view: the animation clock repaints only this card.
pub(crate) struct MatrixView;

impl Render for MatrixView {
    fn render(&mut self, _: &mut Window, _: &mut Context<Self>) -> impl IntoElement {
        div()
            .id("home-matrix")
            .debug_selector(|| "home-matrix".into())
            .size_full()
            .overflow_hidden()
            .child(
                canvas(
                    |_, _, _| (),
                    |bounds, _, window, cx| {
                        let time = if pulse::request(pulse::Rate::Smooth, window, cx) {
                            pulse::elapsed(cx).as_secs_f32()
                        } else {
                            4.
                        };
                        window.with_content_mask(Some(gpui::ContentMask { bounds }), |window| {
                            rain(bounds, time, window, cx)
                        });
                    },
                )
                .size_full(),
            )
    }
}

/// Where each column's falling head is, in rows from the top, plus its trail.
pub(crate) fn head(column: u32, rows: f32, time: f32) -> (f32, f32) {
    let speed = 2.5 + noise(column) * 3.5;
    let trail = 7. + noise(column + 401) * 9.;
    let travel = rows + trail;
    ((time * speed + noise(column + 77) * travel) % travel, trail)
}

fn rain(bounds: Bounds<Pixels>, time: f32, window: &mut Window, cx: &mut App) {
    let (width, height) = extent(bounds);
    let columns = ((width / COLUMN) as usize).min(MAX_COLUMNS);
    let gap = width / columns.max(1) as f32;
    let rows = (height / ROW).ceil();
    let accent = accent_color();
    let font = window.text_style().font();
    let mut mono = font.clone();
    mono.family = crate::fonts::familiar().into();

    for column in 0..columns as u32 {
        let (head, trail) = head(column, rows, time);
        for tail in 0..=trail.ceil() as u32 {
            let row = head - tail as f32;
            if row < 0. || row >= rows {
                continue;
            }
            let age = tail as f32 / trail;
            let color: Hsla = if age < 0.06 {
                white(0.75)
            } else {
                accent.opacity(tail_alpha(age))
            };
            let flicker = (time * 2.) as u32 / (3 + column % 4);
            let glyph =
                GLYPHS[(noise(column * 131 + tail * 17 + flicker) * GLYPHS.len() as f32) as usize];
            let text = SharedString::from((glyph as char).to_string());
            let run = TextRun {
                len: text.len(),
                font: mono.clone(),
                color,
                background_color: None,
                underline: None,
                strikethrough: None,
            };
            let line = window
                .text_system()
                .shape_line(text, px(FONT), &[run], None);
            let at = bounds.origin + point(px(column as f32 * gap), px(row * ROW));
            let _ = line.paint(at, px(ROW), TextAlign::Left, None, window, cx);
        }
    }
}

fn tail_alpha(age: f32) -> f32 {
    quantize((1. - age).max(0.).powf(1.6) * 0.85)
}

fn quantize(alpha: f32) -> f32 {
    (alpha * FADE_STEPS).ceil() / FADE_STEPS
}

#[cfg(test)]
mod tests {
    use super::{head, quantize, tail_alpha};

    #[test]
    fn all_tail_opacities_are_finite_including_fractional_trail_end() {
        for column in 0..80 {
            let (_, trail) = head(column, 30., 1.);
            for tail in 0..=trail.ceil() as u32 {
                let age = tail as f32 / trail;
                let opacity = tail_alpha(age);
                assert!(opacity.is_finite());
                assert!((0. ..=1.).contains(&opacity));
            }
        }
    }

    #[test]
    fn trail_alpha_has_few_distinct_steps() {
        let steps: std::collections::BTreeSet<u32> = (0..100)
            .map(|i| (quantize(i as f32 / 100.) * 1000.) as u32)
            .collect();
        assert!(steps.len() <= 7);
    }

    #[test]
    fn head_movement_is_continuous_between_frames() {
        for column in 0..80 {
            let (a, trail) = head(column, 30., 1.);
            let (b, _) = head(column, 30., 1. + 1. / 30.);
            let distance = (b - a).rem_euclid(30. + trail);
            assert!(distance > 0. && distance < 0.21);
        }
    }

    #[test]
    fn heads_fall_and_wrap_within_the_column() {
        let (early, trail) = head(3, 20., 0.);
        let (later, _) = head(3, 20., 0.4);
        assert!((0. ..20. + trail).contains(&early));
        assert!((0. ..20. + trail).contains(&later));
        assert_ne!(early, later);
    }
}
