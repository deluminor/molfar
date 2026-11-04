use super::{
    super::{Home, card},
    Body,
    parts::{self, mono},
};
use crate::theme::*;
use gpui::{AnyElement, Context, Div, div, prelude::*, px};

impl Home {
    pub(super) fn host_widget(&self, body: Body, cx: &mut Context<Self>) -> AnyElement {
        let host = &self.feeds.host;
        let Some(stats) = host.latest else {
            return card::note(host.error.clone().unwrap_or_else(|| "Sampling…".into()))
                .into_any_element();
        };
        let animate = !cx.reduce_motion();
        let entrance = self.entrance as usize;
        let size = (body.h / 4.).clamp(16., 30.);
        let side_by_side = body.w >= 360.;
        let cpu = stats
            .cpu_percent
            .map_or("—".into(), |cpu| format!("{cpu:.0}%"));

        let gauges = div()
            .flex_1()
            .min_h_0()
            .flex()
            .when(side_by_side, |gauges| gauges.flex_row().gap_4())
            .when(!side_by_side, |gauges| gauges.flex_col().gap_2())
            .child(gauge(
                "CPU",
                cpu,
                stats.cpu_percent.unwrap_or(0.),
                host.cpu.iter().copied().collect(),
                size,
                ("home-host-cpu", entrance),
                animate,
            ))
            .child(gauge(
                "Memory",
                format!("{:.0}%", stats.memory_percent),
                stats.memory_percent,
                host.memory.iter().copied().collect(),
                size,
                ("home-host-memory", entrance),
                animate,
            ));

        let mut facts = div().flex().flex_wrap().gap_x_4().gap_y_1();
        for (caption, value) in [
            ("Swap", format!("{:.0}%", stats.swap_percent)),
            (
                "Load",
                stats
                    .load_average
                    .map_or("—".into(), |load| format!("{load:.2}")),
            ),
            ("Cores", stats.cpu_count.to_string()),
            (
                "Processes",
                stats
                    .process_count
                    .map_or("—".into(), |count| count.to_string()),
            ),
        ] {
            facts = facts.child(
                div()
                    .flex()
                    .items_baseline()
                    .gap_1p5()
                    .child(parts::label(caption))
                    .child(
                        div()
                            .font_family(mono())
                            .text_size(px(12.))
                            .text_color(content(0.85))
                            .child(value),
                    ),
            );
        }

        div()
            .size_full()
            .flex()
            .flex_col()
            .gap_2()
            .child(gauges)
            .when(body.h >= 110., |widget| widget.child(facts))
            .into_any_element()
    }
}

fn gauge(
    caption: &'static str,
    value: String,
    percent: f32,
    history: Vec<f32>,
    size: f32,
    id: (&'static str, usize),
    animate: bool,
) -> Div {
    let hot = percent >= 85.;
    let color = if hot {
        crate::modal::danger(1.)
    } else {
        accent_color()
    };
    div()
        .flex_1()
        .min_w_0()
        .min_h_0()
        .flex()
        .flex_col()
        .gap_1p5()
        .child(
            div()
                .flex()
                .items_end()
                .justify_between()
                .gap_3()
                .child(parts::metric(value, caption, size))
                .child(
                    div()
                        .flex_1()
                        .h(px(size))
                        .min_w(px(40.))
                        .child(parts::sparkline(history, color)),
                ),
        )
        .child(parts::bar(id, percent / 100., color.opacity(0.7), animate))
}
