use super::readout::{self, pressure_color};
use crate::home::data::feeds::history::{GAP_MS, Sample, WINDOW_MS};
use gpui::{Context, Entity, PathBuilder, Render, Window, canvas, point, prelude::*, px};
use molfar_core::host::HostStats;
use std::{collections::VecDeque, sync::Arc};

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

fn lerp(from: f32, to: f32, t: f32) -> f32 {
    from + (to - from) * t
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

pub(super) fn chart(
    history: &VecDeque<Sample>,
    metric: Metric,
    now: u64,
    cores: usize,
    cx: &mut Context<crate::home::Home>,
) -> Entity<ChartView> {
    cx.new(|_| ChartView {
        history: Arc::new(history.clone()),
        metric,
        now,
        cores,
    })
}

pub(super) struct ChartView {
    history: Arc<VecDeque<Sample>>,
    metric: Metric,
    now: u64,
    cores: usize,
}

impl Render for ChartView {
    fn render(&mut self, _: &mut Window, _: &mut Context<Self>) -> impl IntoElement {
        let history = self.history.clone();
        let metric = self.metric;
        let now = self.now;
        let cores = self.cores;
        let scale = metric.scale(&history);
        canvas(
            |_, _, _| (),
            move |bounds, _, window, cx| {
                let now = if crate::pulse::request(crate::pulse::Rate::Smooth, window, cx) {
                    molfar_core::time::now_ms()
                } else {
                    now
                };
                let segments = segments(&history, metric, now);
                let width = bounds.size.width.to_f64() as f32;
                let height = bounds.size.height.to_f64() as f32;
                let at = |x: f32, value: f32| {
                    bounds.origin
                        + point(
                            px(x * width),
                            px(height * (1. - (value / scale).clamp(0., 1.))),
                        )
                };
                let mut grid = PathBuilder::stroke(px(1.));
                for fraction in [0., 0.5, 1.] {
                    grid.move_to(at(0., fraction * scale));
                    grid.line_to(at(1., fraction * scale));
                }
                if let Ok(grid) = grid.build() {
                    window.paint_path(grid, crate::theme::content(0.06));
                }
                let accent = crate::theme::accent_color();
                for segment in &segments {
                    let points = reduce(segment, width.max(1.));
                    for pair in points.windows(2) {
                        let (x0, v0) = pair[0];
                        let (x1, v1) = pair[1];
                        let p0 = readout::fraction(metric, v0, cores);
                        let p1 = readout::fraction(metric, v1, cores);
                        let marks = readout::span_marks(p0, p1);
                        for mark in marks.windows(2) {
                            let (t0, t1) = (mark[0], mark[1]);
                            let mut line = PathBuilder::stroke(px(1.5));
                            line.move_to(at(lerp(x0, x1, t0), lerp(v0, v1, t0)));
                            line.line_to(at(lerp(x0, x1, t1), lerp(v0, v1, t1)));
                            let mid = lerp(p0, p1, (t0 + t1) / 2.);
                            if let Ok(line) = line.build() {
                                window.paint_path(line, pressure_color(accent, mid).opacity(0.9));
                            }
                        }
                    }
                    if let Some((x, value)) = points.last() {
                        let color =
                            pressure_color(accent, readout::fraction(metric, *value, cores));
                        window.paint_quad(gpui::fill(
                            gpui::Bounds::new(
                                at(*x, *value) - point(px(1.5), px(1.5)),
                                gpui::size(px(3.), px(3.)),
                            ),
                            color,
                        ));
                    }
                }
            },
        )
        .size_full()
    }
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
