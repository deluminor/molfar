use super::chart::Metric;
use crate::{
    home::data::feeds::history::{GAP_MS, Sample, WINDOW_MS},
    theme::is_light,
};
use gpui::{Hsla, Rgba};
use molfar_core::host::HostStats;
use std::collections::VecDeque;

const WARM: f32 = 0.70;
const HOT: f32 = 0.90;

pub(super) fn pressure_color(accent: Hsla, fraction: f32) -> Hsla {
    let t = fraction.clamp(0., 1.);
    let orange = gpui::hsla(
        28. / 360.,
        0.9,
        if is_light() { 0.42 } else { 0.62 },
        accent.a,
    );
    let red = crate::modal::danger(accent.a);
    if t <= WARM {
        accent
    } else if t <= HOT {
        mix(accent, orange, (t - WARM) / (HOT - WARM))
    } else {
        mix(orange, red, ((t - HOT) / (1. - HOT)).min(1.))
    }
}

pub(super) fn fraction(metric: Metric, value: f32, cores: usize) -> f32 {
    match metric {
        Metric::Load => value / cores.max(1) as f32,
        _ => value / 100.,
    }
}

pub(super) fn detail(
    metric: Metric,
    stats: HostStats,
    history: &VecDeque<Sample>,
    now: u64,
) -> String {
    match metric {
        Metric::Cpu => peak(metric, history, now)
            .map(|value| format!("peak {value:.0}%"))
            .unwrap_or_else(|| "peak —".into()),
        Metric::Memory => bytes(stats.memory_used, stats.memory_total),
        Metric::Swap => {
            if stats.swap_total == 0 {
                "no swap".into()
            } else {
                bytes(stats.swap_used, stats.swap_total)
            }
        }
        Metric::Load => stats
            .load_average
            .map(|load| format!("{:.2} / core", load / stats.cpu_count.max(1) as f64))
            .unwrap_or_else(|| "—".into()),
    }
}

pub(super) fn window_has_gap(history: &VecDeque<Sample>, now: u64) -> bool {
    let mut last = None;
    for sample in history {
        if sample.at > now || now.saturating_sub(sample.at) > WINDOW_MS {
            continue;
        }
        if sample.stats.is_none() {
            return true;
        }
        if last.is_some_and(|at| sample.at.saturating_sub(at) > GAP_MS) {
            return true;
        }
        last = Some(sample.at);
    }
    false
}

fn bytes(used: u64, total: u64) -> String {
    if total == 0 {
        return "—".into();
    }
    format!("{} / {} GB", gigabytes(used), gigabytes(total))
}

fn gigabytes(bytes: u64) -> String {
    let gigabytes = bytes as f64 / 1_073_741_824.;
    if gigabytes >= 10. {
        format!("{gigabytes:.0}")
    } else {
        format!("{gigabytes:.1}")
    }
}

fn peak(metric: Metric, history: &VecDeque<Sample>, now: u64) -> Option<f32> {
    history
        .iter()
        .filter(|sample| sample.at <= now && now.saturating_sub(sample.at) <= WINDOW_MS)
        .filter_map(|sample| sample.stats.and_then(|stats| metric.value(stats)))
        .max_by(|left, right| left.total_cmp(right))
}

fn mix(from: Hsla, to: Hsla, t: f32) -> Hsla {
    let t = t.clamp(0., 1.);
    let from = Rgba::from(from);
    let to = Rgba::from(to);
    Hsla::from(Rgba {
        r: from.r + (to.r - from.r) * t,
        g: from.g + (to.g - from.g) * t,
        b: from.b + (to.b - from.b) * t,
        a: from.a + (to.a - from.a) * t,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use gpui::hsla;

    fn distance(from: Hsla, to: Hsla) -> f32 {
        let from = Rgba::from(from);
        let to = Rgba::from(to);
        let (r, g, b) = (from.r - to.r, from.g - to.g, from.b - to.b);
        (r * r + g * g + b * b).sqrt()
    }

    #[test]
    fn color_holds_then_warms_then_heats() {
        let accent = hsla(0.62, 0.55, 0.62, 1.);
        let red = crate::modal::danger(1.);
        assert_eq!(pressure_color(accent, 0.5), accent);
        assert_eq!(pressure_color(accent, WARM), accent);
        let warm = pressure_color(accent, 0.8);
        let hot = pressure_color(accent, 0.95);
        let full = pressure_color(accent, 1.);
        assert_eq!(full, red);
        assert!(distance(warm, red) > distance(hot, red));
        assert!(distance(hot, red) > distance(full, red));
    }

    #[test]
    fn detail_uses_peak_bytes_and_load_per_core() {
        let stats = HostStats {
            cpu_percent: Some(12.),
            memory_used: 8 * 1_073_741_824,
            memory_total: 16 * 1_073_741_824,
            swap_total: 0,
            load_average: Some(2.6),
            cpu_count: 13,
            ..Default::default()
        };
        let history = VecDeque::from([
            Sample {
                at: 0,
                stats: Some(HostStats {
                    cpu_percent: Some(40.),
                    ..Default::default()
                }),
            },
            Sample {
                at: 2_000,
                stats: Some(stats),
            },
        ]);
        assert_eq!(detail(Metric::Cpu, stats, &history, 2_000), "peak 40%");
        assert_eq!(
            detail(Metric::Memory, stats, &history, 2_000),
            "8.0 / 16 GB"
        );
        assert_eq!(detail(Metric::Swap, stats, &history, 2_000), "no swap");
        assert_eq!(detail(Metric::Load, stats, &history, 2_000), "0.20 / core");
    }
}
