mod chart;
mod readout;

use super::{
    super::{Home, card},
    Body,
    parts::{self, mono},
};
use crate::{
    home::data::feeds::history::{GAP_MS, HostFeed},
    theme::*,
};
use chart::Metric;
use gpui::{Animation, AnimationExt, AnyElement, Context, Div, div, prelude::*, px};
use std::time::Duration;

impl Home {
    pub(super) fn host_widget(&self, body: Body, cx: &mut Context<Self>) -> AnyElement {
        let host = &self.feeds.host;
        let Some(stats) = host.latest else {
            return card::note(host.error.clone().unwrap_or_else(|| "Sampling…".into()))
                .into_any_element();
        };
        let now = molfar_core::time::now_ms();
        let stale = host.error.is_some()
            || host
                .updated_at
                .is_none_or(|at| now.saturating_sub(at) > GAP_MS);
        let wide = body.w >= 640.;
        let detailed = body.h >= 155.;
        let footer = body.h >= 115.;
        let rows = if wide { 1. } else { 2. };
        let size = (body.h / (rows * 8.)).clamp(15., 20.);
        let readings = [
            (
                "CPU",
                stats.cpu_percent.map_or("—".into(), |v| format!("{v:.0}%")),
                Metric::Cpu,
            ),
            (
                "Memory",
                format!("{:.0}%", stats.memory_percent),
                Metric::Memory,
            ),
            ("Swap", format!("{:.0}%", stats.swap_percent), Metric::Swap),
            (
                "Load",
                stats.load_average.map_or("—".into(), |v| format!("{v:.2}")),
                Metric::Load,
            ),
        ];
        let mut gauges = div().flex().flex_col().flex_1().min_h_0().gap_2();
        for chunk in readings.chunks(if wide { 4 } else { 2 }) {
            let mut row = div().flex().flex_1().min_h_0().gap_2();
            for (caption, value, metric) in chunk {
                row = row.child(gauge(caption, value, *metric, host, now, size, cx));
            }
            gauges = gauges.child(row);
        }
        let coverage = host.coverage_ms(now) / 60_000;
        let state = if stale {
            "STALE · last reading".to_string()
        } else if coverage < 30 {
            format!("LIVE · window {coverage}m / 30m")
        } else {
            "LIVE · last 30 minutes".to_string()
        };
        let aside = if readout::window_has_gap(&host.history, now) {
            "gap in samples".to_string()
        } else {
            molfar_core::host::machine_name().unwrap_or_else(|| "this machine".into())
        };
        let content = div()
            .size_full()
            .min_w_0()
            .min_h_0()
            .overflow_hidden()
            .flex()
            .flex_col()
            .gap_1()
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap_2()
                    .child(parts::dot(!stale))
                    .child(parts::label(state.clone())),
            )
            .child(gauges)
            .when(footer, |widget| {
                widget.child(
                    div()
                        .flex()
                        .justify_between()
                        .items_center()
                        .gap_2()
                        .font_family(mono())
                        .text_size(px(10.))
                        .text_color(content(0.65))
                        .child(format!(
                            "{} cores · {} processes",
                            stats.cpu_count,
                            stats
                                .process_count
                                .map_or("—".into(), |count| count.to_string())
                        ))
                        .child(div().min_w_0().truncate().child(if detailed {
                            aside
                        } else {
                            state
                        })),
                )
            });
        if cx.reduce_motion() {
            content.into_any_element()
        } else {
            content
                .with_animation(
                    ("home-host-reveal", self.entrance as usize),
                    Animation::new(Duration::from_millis(400)),
                    |view, progress| view.opacity(crate::home::motion::ease_out(progress)),
                )
                .into_any_element()
        }
    }
}

fn gauge(
    caption: &'static str,
    value: &str,
    metric: Metric,
    host: &HostFeed,
    now: u64,
    size: f32,
    cx: &mut Context<Home>,
) -> Div {
    let stats = host.latest.unwrap_or_default();
    let fraction = metric
        .value(stats)
        .map(|value| readout::fraction(metric, value, stats.cpu_count))
        .unwrap_or(0.);
    let color = readout::pressure_color(accent_color(), fraction);
    let note = readout::detail(metric, stats, &host.history, now);
    div()
        .flex_1()
        .min_w_0()
        .min_h_0()
        .flex()
        .flex_col()
        .overflow_hidden()
        .rounded_md()
        .bg(content(0.035))
        .border_1()
        .border_color(content(0.08))
        .child(div().h(px(2.)).w_full().flex_shrink_0().bg(color))
        .child(
            div()
                .flex_1()
                .min_h_0()
                .flex()
                .flex_col()
                .gap(px(4.))
                .px(px(10.))
                .pt(px(6.))
                .pb(px(8.))
                .child(
                    div()
                        .flex()
                        .items_baseline()
                        .justify_between()
                        .gap_2()
                        .min_w_0()
                        .child(parts::label(caption).flex_shrink_0())
                        .child(
                            div()
                                .flex_shrink_0()
                                .font_family(mono())
                                .text_size(px(size))
                                .line_height(px(size))
                                .text_color(color)
                                .child(value.to_string()),
                        ),
                )
                .child(
                    div()
                        .min_w_0()
                        .truncate()
                        .font_family(mono())
                        .text_size(px(10.))
                        .line_height(px(12.))
                        .text_color(content(0.5))
                        .child(note),
                )
                .child(div().flex_1().min_h_0().w_full().child(chart::chart(
                    &host.history,
                    metric,
                    now,
                    stats.cpu_count,
                    cx,
                ))),
        )
}
