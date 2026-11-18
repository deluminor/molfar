//! A session's provider mark, working spinner, circled done check and amber
//! attention mark, for sidebar rows and title tabs.
use crate::pulse;
use crate::theme::*;
use gpui::{
    AnyElement, Bounds, Context, ElementId, Hsla, Path, Pixels, Render, Role, Window, canvas, div,
    point, prelude::*, px, rgb, size,
};
use std::f32::consts::TAU;
use std::time::Duration;

/// One wave across the grid, as TerminalSpinner's `molfar-spinner-wave`.
const SPINNER_PERIOD: Duration = Duration::from_millis(1_200);
/// Slate, peach and pink, top row to bottom.
pub(crate) const SPINNER_ROWS: [u32; 3] = [0x6f84a3, 0xe8b583, 0xe47fa6];

/// TerminalSpinner's 12px grid on the shared paint clock.
pub(crate) fn spinner(id: impl Into<ElementId>) -> impl IntoElement {
    div().id(id).size(px(12.)).child(
        canvas(
            |_, _, _| (),
            |bounds, _, window, cx| {
                for (row, color) in SPINNER_ROWS.into_iter().enumerate() {
                    for col in 0..3 {
                        let origin =
                            bounds.origin + point(px(4. * col as f32), px(4. * row as f32));
                        let cell = Bounds::new(origin, size(px(4.), px(4.)));
                        pulse::paint_path(cell, SPINNER_PERIOD, window, cx, move |phase| {
                            Some(dot(cell, row, col, color, phase))
                        });
                    }
                }
            },
        )
        .size_full(),
    )
}

fn dot(
    cell: Bounds<Pixels>,
    row: usize,
    col: usize,
    color: u32,
    phase: f32,
) -> (Path<Pixels>, Hsla) {
    let wave = (0.5 - 0.5 * (phase * TAU - (col + row) as f32 * 0.9).cos()).powf(3.52);
    let peak = 0.93 * (1. - 0.65 * row.abs_diff(col) as f32 / 2.);
    let radius = 1.25 * (0.89 + 0.11 * peak * wave);
    let center = cell.center();
    let mut color: Hsla = rgb(color).into();
    color.a = 0.07 + peak * wave;

    let mut path = Path::new(center);
    path.move_to(center);
    for step in 0..=12 {
        let angle = step as f32 * TAU / 12.;
        path.line_to(center + point(px(radius * angle.cos()), px(radius * angle.sin())));
    }
    (path, color)
}
#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum State {
    Idle,
    Working,
    Done,
    /// Waiting on an approval or a question.
    Attention,
}

/// A session mark with an independently animated working state.
pub(crate) struct SessionMark {
    side: f32,
    provider: String,
    state: State,
}
impl SessionMark {
    pub(crate) fn new(provider: String) -> Self {
        Self {
            side: 16.,
            provider,
            state: State::Idle,
        }
    }
    /// A title tab's mark. Tabs paint inside their own cached frame, so they
    /// can't share the sidebar's entity: a notify only repaints the cached
    /// views along the one path the entity was last drawn in.
    pub(crate) fn tab(provider: String) -> Self {
        Self {
            side: 14.,
            ..Self::new(provider)
        }
    }
    #[cfg(test)]
    pub(crate) fn state(&self) -> State {
        self.state
    }
    pub(crate) fn set_size(&mut self, side: f32, cx: &mut Context<Self>) {
        if self.side != side {
            self.side = side;
            cx.notify();
        }
    }
    pub(crate) fn set(&mut self, provider: &str, state: State, cx: &mut Context<Self>) {
        if self.state == state && self.provider == provider {
            return;
        }
        self.provider = provider.to_owned();
        self.state = state;
        cx.notify();
    }
}
impl Render for SessionMark {
    fn render(&mut self, _: &mut Window, _: &mut Context<Self>) -> impl IntoElement {
        let side = self.side;
        let mark: AnyElement = match self.state {
            State::Idle => provider_icon(&self.provider, side).into_any_element(),
            State::Working => div()
                .id("session-working")
                .child(spinner("session-working-spinner"))
                .role(Role::Image)
                .aria_label("Working")
                .into_any_element(),
            // Tailwind teal-400 and amber-400, as TitleBar.tsx.
            State::Done => div()
                .id("session-done")
                .role(Role::Image)
                .aria_label("Done")
                .child(icon("check-circle-2", 14.).text_color(rgb(0x2dd4bf)))
                .into_any_element(),
            State::Attention => div()
                .id("session-attention")
                .role(Role::Image)
                .aria_label("Needs approval")
                .child(icon("alert-circle", 14.).text_color(rgb(0xfbbf24)))
                .into_any_element(),
        };
        div()
            .debug_selector(|| "session-provider-mark".into())
            .size(px(side))
            .flex()
            .items_center()
            .justify_center()
            .child(mark)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use gpui::TestAppContext;
    #[gpui::test]
    fn working_mark_spins_on_the_shared_clock_and_stops_after_completion(cx: &mut TestAppContext) {
        cx.update(|cx| cx.set_reduce_motion(false));
        let (mark, cx) = cx.add_window_view(|_, _| SessionMark::new("codex".into()));
        mark.update(cx, |mark, cx| mark.set("codex", State::Working, cx));
        cx.run_until_parked();
        cx.update(|_, cx| assert!(pulse::running(cx)));
        gpui::frame_stats::enable();
        cx.simulate_visibility_change(gpui::WindowVisibility::Hidden);
        gpui::frame_stats::take();
        cx.executor().advance_clock(crate::pulse::TICK * 4);
        cx.run_until_parked();
        assert!(gpui::frame_stats::take().counters.is_empty());
        cx.simulate_visibility_change(gpui::WindowVisibility::Visible);
        cx.executor().advance_clock(crate::pulse::TICK * 4);
        cx.run_until_parked();
        assert_eq!(
            gpui::frame_stats::take().counters,
            [("animated-path-steps", 2)]
        );

        cx.update(|_, cx| cx.set_reduce_motion(true));
        cx.run_until_parked();
        cx.executor().advance_clock(crate::pulse::TICK * 2);
        cx.run_until_parked();
        cx.update(|window, cx| {
            assert!(!window.has_animated_paths());
            assert!(!pulse::running(cx));
            cx.set_reduce_motion(false);
        });
        cx.run_until_parked();
        cx.update(|window, cx| {
            assert!(window.has_animated_paths());
            assert!(pulse::running(cx));
        });

        mark.update(cx, |mark, cx| mark.set("codex", State::Done, cx));
        cx.run_until_parked();
        cx.executor().advance_clock(crate::pulse::TICK * 2);
        cx.run_until_parked();
        cx.update(|_, cx| assert!(!pulse::running(cx)));
    }
}
