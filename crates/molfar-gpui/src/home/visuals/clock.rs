use super::clock_seconds;
use crate::{popover::AnchorSlot, theme::*};
use chrono::Local;
use gpui::{Context, Render, Task, Window, div, prelude::*, px};
use std::time::{Duration, Instant};

const TICK: Duration = Duration::from_secs(1);

/// Its own view, so the seconds tick redraws only the clock.
pub(crate) struct ClockView {
    frame: AnchorSlot,
    painted_at: Option<Instant>,
    _tick: Task<()>,
}

impl ClockView {
    pub(crate) fn new(cx: &mut Context<Self>) -> ClockView {
        let tick = cx.spawn(async move |this, cx| {
            loop {
                cx.background_executor().timer(TICK).await;
                let alive = this.update(cx, |this, cx| {
                    let now = cx.background_executor().now();
                    if this
                        .painted_at
                        .is_some_and(|painted| now.saturating_duration_since(painted) <= TICK * 3)
                    {
                        cx.notify();
                    }
                });
                if alive.is_err() {
                    break;
                }
            }
        });
        ClockView {
            frame: AnchorSlot::default(),
            painted_at: None,
            _tick: tick,
        }
    }
}

/// Time size that fills the card without clipping: limited by width and height.
pub(crate) fn time_size(width: f32, height: f32) -> f32 {
    (width / 4.4).min(height * 0.42).clamp(18., 120.)
}

impl Render for ClockView {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        self.painted_at = Some(cx.background_executor().now());
        let (width, height) = self.frame.get().map_or((160., 100.), |bounds| {
            (
                bounds.size.width.to_f64() as f32,
                bounds.size.height.to_f64() as f32,
            )
        });
        let size = time_size(width, height);
        let now = Local::now();
        let expanded = width >= 220. && height >= 115.;
        let mono = crate::fonts::familiar();
        let colon_view = div()
            .text_size(px(size))
            .line_height(px(size))
            .text_color(accent_color().opacity(0.85))
            .child(":");

        div()
            .id("home-clock")
            .debug_selector(|| "home-clock".into())
            .relative()
            .size_full()
            .overflow_hidden()
            .flex()
            .flex_col()
            .justify_center()
            .gap(px(size * 0.12))
            .child(self.frame.layout_probe())
            .child(
                div()
                    .flex()
                    .items_baseline()
                    .font_family(mono)
                    .text_color(content(1.))
                    .child(
                        div()
                            .text_size(px(size))
                            .line_height(px(size))
                            .child(now.format("%H").to_string()),
                    )
                    .child(colon_view)
                    .child(
                        div()
                            .text_size(px(size))
                            .line_height(px(size))
                            .child(now.format("%M").to_string()),
                    )
                    .child(
                        div()
                            .ml(px(size * 0.12))
                            .text_size(px(size * 0.32))
                            .text_color(accent_color().opacity(0.8))
                            .child(now.format("%S").to_string()),
                    ),
            )
            .child(
                div()
                    .font_family(mono)
                    .text_size(px((size * 0.2).clamp(10., 14.)))
                    .text_color(content(0.5))
                    .truncate()
                    .child(if width < 210. {
                        now.format("%a, %-d %b").to_string().to_uppercase()
                    } else {
                        now.format("%A, %-d %B").to_string().to_uppercase()
                    }),
            )
            .when(expanded, |clock| {
                clock.child(
                    div()
                        .flex()
                        .items_center()
                        .justify_between()
                        .gap_2()
                        .font_family(mono)
                        .text_size(px(10.))
                        .text_color(content(0.55))
                        .child("LOCAL TIME")
                        .child(now.format("UTC %:z").to_string()),
                )
            })
            .when(height >= 90., |clock| {
                clock.child(div().mt(px(4.)).child(clock_seconds::rail()))
            })
    }
}

#[cfg(test)]
mod tests {
    use super::time_size;

    #[test]
    fn time_grows_with_the_card_and_stays_bounded() {
        assert!(time_size(400., 300.) > time_size(160., 100.));
        assert_eq!(time_size(10., 10.), 18.);
        assert_eq!(time_size(5000., 5000.), 120.);
        assert_eq!(time_size(200., 1000.), 200. / 4.4);
        for (width, height) in [(112., 92.), (220., 115.), (375., 160.), (900., 400.)] {
            let size = time_size(width, height);
            assert!(size * 4.4 <= width + 0.01);
            assert!(size + 14. + size * 0.36 + 26. <= height);
        }
    }
}
