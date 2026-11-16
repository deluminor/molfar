use super::{
    curve,
    readout::{self, pressure_color},
};
use crate::home::data::feeds::history::{GAP_MS, Sample, WINDOW_MS};
use gpui::{PathBuilder, canvas, point, prelude::*, px};
use molfar_core::host::HostStats;
use std::collections::VecDeque;

#[derive(Clone, Copy)]
pub(super) enum Metric {
    Cpu,
    Memory,
    Swap,
    Load,
}

impl Metric {
    pub(super) fn value(self, stats: HostStats) -> Option<f32> {
        match self {
            Self::Cpu => stats.cpu_percent,
            Self::Memory => Some(stats.memory_percent),
            Self::Swap => Some(stats.swap_percent),
            Self::Load => stats.load_average.map(|load| load as f32),
        }
        .filter(|value| value.is_finite())
    }

    pub(super) fn scale(self, history: &VecDeque<Sample>) -> f32 {
        match self {
            Self::Load => history
                .iter()
                .filter_map(|sample| sample.stats)
                .filter_map(|stats| self.value(stats))
                .fold(1., f32::max)
                .ceil(),
            _ => 100.,
        }
    }
}

pub(super) fn segments(
    history: &VecDeque<Sample>,
    metric: Metric,
    now: u64,
) -> Vec<Vec<(f32, f32)>> {
    let mut result = Vec::new();
    let mut current = Vec::new();
    let mut last = None;
    for sample in history {
        let value = sample.stats.and_then(|stats| metric.value(stats));
        let in_window = sample.at <= now && now - sample.at <= WINDOW_MS;
        let gap = last.is_some_and(|at| sample.at.saturating_sub(at) > GAP_MS);
        if (!in_window || value.is_none() || gap) && !current.is_empty() {
            result.push(std::mem::take(&mut current));
        }
        if in_window && let Some(value) = value {
            let x = 1. - (now - sample.at) as f32 / WINDOW_MS as f32;
            current.push((x, value));
        }
        last = Some(sample.at);
    }
    if !current.is_empty() {
        result.push(current);
    }
    result
}

fn reduce(points: &[(f32, f32)], width: f32) -> Vec<(f32, f32)> {
    let mut output = Vec::new();
    let mut index = 0;
    while index < points.len() {
        let bucket = (points[index].0 * width).floor();
        let mut end = index + 1;
        while end < points.len() && (points[end].0 * width).floor() == bucket {
            end += 1;
        }
        let mut selected = vec![index, end - 1];
        if let Some(min) = (index..end).min_by(|a, b| points[*a].1.total_cmp(&points[*b].1)) {
            selected.push(min);
        }
        if let Some(max) = (index..end).max_by(|a, b| points[*a].1.total_cmp(&points[*b].1)) {
            selected.push(max);
        }
        selected.sort_unstable();
        selected.dedup();
        output.extend(selected.into_iter().map(|index| points[index]));
        index = end;
    }
    output
}

/// A metric's line over the 30-minute window. It repaints only when Home
/// re-renders on a new sample: one pixel spans several seconds of the window,
/// so a per-frame scroll would cost frames without visible movement.
pub(super) fn chart(
    history: &VecDeque<Sample>,
    metric: Metric,
    now: u64,
    cores: usize,
) -> impl IntoElement {
    let scale = metric.scale(history);
    let segments = segments(history, metric, now);

    canvas(
        |_, _, _| (),
        move |bounds, _, window, _| {
            let width = f32::from(bounds.size.width);
            let height = f32::from(bounds.size.height);
            let y = |value: f32| height * (1. - (value / scale).clamp(0., 1.));
            let at = |(x, y): (f32, f32)| bounds.origin + point(px(x), px(y));

            let mut grid = PathBuilder::stroke(px(1.));
            for fraction in [0., 0.5, 1.] {
                grid.move_to(at((0., y(fraction * scale))));
                grid.line_to(at((width, y(fraction * scale))));
            }
            if let Ok(grid) = grid.build() {
                window.paint_path(grid, crate::theme::content(0.06));
            }

            let accent = crate::theme::accent_color();
            for segment in &segments {
                let pixels: Vec<(f32, f32)> = reduce(segment, width.max(1.))
                    .into_iter()
                    .map(|(x, value)| (x * width, value))
                    .collect();
                let curve = curve::smooth(&pixels);
                let pressure = |(_, value): (f32, f32)| readout::fraction(metric, value, cores);
                let Some(&last) = curve.last() else {
                    continue;
                };
                let tone = pressure_color(accent, pressure(last));

                if curve.len() > 1 {
                    let mut area = PathBuilder::fill();
                    area.move_to(at((curve[0].0, height)));
                    for &(x, value) in &curve {
                        area.line_to(at((x, y(value))));
                    }
                    area.line_to(at((last.0, height)));
                    area.close();
                    if let Ok(area) = area.build() {
                        window.paint_path(
                            area,
                            gpui::linear_gradient(
                                180.,
                                gpui::linear_color_stop(tone.opacity(0.18), 0.),
                                gpui::linear_color_stop(tone.opacity(0.), 1.),
                            ),
                        );
                    }
                }

                for (band, run) in curve::color_runs(&curve, pressure) {
                    let mut line = PathBuilder::stroke(px(1.5));
                    for (index, &(x, value)) in run.iter().enumerate() {
                        let p = at((x, y(value)));
                        if index == 0 {
                            line.move_to(p);
                        } else {
                            line.line_to(p);
                        }
                    }
                    if let Ok(line) = line.build() {
                        window.paint_path(line, pressure_color(accent, band));
                    }
                }

                let head = at((last.0, y(last.1)));
                for (radius, alpha) in [(4., 0.2), (2., 1.)] {
                    window.paint_quad(
                        gpui::fill(
                            gpui::Bounds::new(
                                head - point(px(radius), px(radius)),
                                gpui::size(px(radius * 2.), px(radius * 2.)),
                            ),
                            tone.opacity(alpha),
                        )
                        .corner_radii(px(radius)),
                    );
                }
            }
        },
    )
    .size_full()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_cpu_and_long_pauses_split_chart() {
        let sample = |at, cpu| Sample {
            at,
            stats: Some(HostStats {
                cpu_percent: cpu,
                ..Default::default()
            }),
        };
        let history = VecDeque::from([
            sample(0, None),
            sample(2000, Some(20.)),
            sample(4000, Some(30.)),
            sample(20_000, Some(50.)),
        ]);
        let lines = segments(&history, Metric::Cpu, 20_000);
        assert_eq!(lines.iter().map(Vec::len).collect::<Vec<_>>(), vec![2, 1]);
        assert_eq!(lines[1][0].0, 1.);
    }

    #[test]
    fn reduction_preserves_spikes_and_order() {
        let points = [(0.1, 1.), (0.11, 90.), (0.12, 0.), (0.13, 2.), (0.14, 3.)];
        let reduced = reduce(&points, 1.);
        assert!(reduced.contains(&(0.11, 90.)));
        assert!(reduced.contains(&(0.12, 0.)));
        assert!(reduced.windows(2).all(|pair| pair[0].0 < pair[1].0));
    }
}
