use super::{Rate, elapsed, phase_at, start};
use gpui::{App, Bounds, Hsla, Path, Pixels, Window};
use std::time::Duration;

pub(crate) fn paint(
    bounds: Bounds<Pixels>,
    period: Duration,
    window: &mut Window,
    cx: &mut App,
    frame: impl Fn(f32) -> Option<(Path<Pixels>, Hsla)> + Send + Sync + 'static,
) {
    if cx.reduce_motion() {
        if let Some((path, color)) = frame(0.) {
            window.paint_path(path, color);
        }
        return;
    }

    let now = elapsed(cx);
    start(cx);
    window.paint_animated_path(bounds, now, move |elapsed| frame(phase_at(period, elapsed)));
}

pub(super) fn step(tick: u64, cx: &mut App) -> bool {
    if cx.reduce_motion() {
        return false;
    }

    let due = tick.is_multiple_of(Rate::Half.stride());
    let now = elapsed(cx);
    let mut has_paths = false;
    for handle in cx.windows() {
        let _ = handle.update(cx, |_, window, _| {
            if window.has_animated_paths() {
                has_paths = true;
                if due && window.is_visible() {
                    window.step_animated_paths(now);
                }
            }
        });
    }
    has_paths
}
