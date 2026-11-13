use super::super::{
    super::data::consumption::{Range, Recent, bar_heights},
    parts::{self, mono},
};
use crate::{
    consumption::{format, tooltip},
    home::Home,
    theme::*,
};
use gpui::{Animation, AnimationExt, Context, Div, SharedString, div, prelude::*, px};
use molfar_core::consumption::summary::{Reporting, UsageSummary};
use std::time::Duration;

const BAR_HEIGHT: f32 = 34.;
const BAR_GROW: Duration = Duration::from_millis(600);

pub(super) fn amount(summary: &UsageSummary) -> String {
    match summary.reporting() {
        Reporting::Empty => "—".into(),
        Reporting::NotReported => "n/a".into(),
        _ => format::estimate(summary).unwrap_or_else(|| format::tokens(summary.total_tokens())),
    }
}

pub(super) fn figure(label: &'static str, summary: &UsageSummary) -> Div {
    let tokens = (summary.reporting() != Reporting::Empty)
        .then(|| format!("{} tok", format::tokens(summary.total_tokens())));
    div()
        .flex_1()
        .min_w_0()
        .flex()
        .flex_col()
        .gap_0p5()
        .child(parts::label(label))
        .child(
            div()
                .font_family(mono())
                .text_size(px(17.))
                .text_color(content(1.))
                .truncate()
                .child(amount(summary)),
        )
        .children(tokens.map(|tokens| {
            div()
                .font_family(mono())
                .text_size(px(10.))
                .text_color(content(0.4))
                .child(tokens)
        }))
}

pub(super) fn bars(recent: &Recent, range: Range, entrance: u32, animate: bool) -> Div {
    let heights = bar_heights(&recent.bars);
    let mut row = div().h(px(BAR_HEIGHT + 14.)).flex().items_end().gap_1();
    for (index, ((date, day), height)) in recent.bars.iter().zip(heights).enumerate() {
        let today = index + 1 == recent.bars.len();
        let tone = accent_color().opacity(if today { 0.85 } else { 0.35 });
        let target = (height * BAR_HEIGHT).max(2.);
        let fill = div()
            .w_full()
            .rounded_sm()
            .bg(if height > 0. { tone } else { content(0.1) });
        let fill = if animate {
            fill.with_animation(
                SharedString::from(format!(
                    "home-consumption-bar-{entrance}-{}-{index}",
                    range.label()
                )),
                Animation::new(BAR_GROW),
                move |fill, t| fill.h(px(target * crate::home::motion::ease_out(t))),
            )
            .into_any_element()
        } else {
            fill.h(px(target)).into_any_element()
        };
        let title = range.title(*date);
        let summary = *day;
        row = row.child(
            div()
                .id(SharedString::from(format!("home-consumption-day-{index}")))
                .flex_1()
                .flex()
                .flex_col()
                .items_center()
                .justify_end()
                .gap_1()
                .h_full()
                .tooltip(move |_, cx| tooltip::view(title.clone(), summary, cx))
                .hover(|style| style.bg(accent_color().opacity(0.08)))
                .child(
                    div()
                        .w_full()
                        .h(px(BAR_HEIGHT))
                        .flex()
                        .items_end()
                        .child(fill),
                )
                .child(
                    div()
                        .font_family(mono())
                        .text_size(px(9.))
                        .text_color(content(if today { 0.7 } else { 0.35 }))
                        .child(range.axis_label(*date, index, recent.bars.len())),
                ),
        );
    }

    row
}

pub(super) fn range_selector(range: Range, cx: &mut Context<Home>) -> Div {
    div()
        .flex()
        .gap_1()
        .children([Range::Month, Range::Year].map(|choice| {
            let id = match choice {
                Range::Month => "home-consumption-month",
                Range::Year => "home-consumption-year",
            };
            div()
                .id(id)
                .debug_selector(move || id.into())
                .role(gpui::Role::Button)
                .aria_label(choice.label())
                .cursor_pointer()
                .px_2()
                .py_0p5()
                .rounded_md()
                .font_family(mono())
                .text_size(px(10.))
                .text_color(if range == choice {
                    accent_color()
                } else {
                    content(0.5)
                })
                .when(range == choice, |d| d.bg(accent_color().opacity(0.1)))
                .hover(|style| style.bg(content(0.07)))
                .child(choice.label())
                .on_click(cx.listener(move |home, _, _, cx| {
                    home.feeds.consumption.range = choice;
                    cx.notify();
                }))
        }))
}
