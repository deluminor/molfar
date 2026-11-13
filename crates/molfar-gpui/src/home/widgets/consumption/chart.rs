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

const BAR_GROW: Duration = Duration::from_millis(600);

pub(super) fn amount(summary: &UsageSummary) -> String {
    match summary.reporting() {
        Reporting::Empty => "—".into(),
        Reporting::NotReported => "n/a".into(),
        _ => format::estimate(summary).unwrap_or_else(|| format::tokens(summary.total_tokens())),
    }
}

pub(super) fn figure(label: &'static str, summary: &UsageSummary) -> Div {
    figure_with_heading(parts::label(label).line_height(px(16.)), summary)
}

pub(super) fn figure_with_heading(heading: impl IntoElement, summary: &UsageSummary) -> Div {
    let tokens = (summary.reporting() != Reporting::Empty)
        .then(|| format!("{} tok", format::tokens(summary.total_tokens())));
    div()
        .flex_1()
        .min_w_0()
        .flex()
        .flex_col()
        .gap_0p5()
        .child(heading)
        .child(
            div()
                .font_family(mono())
                .text_size(px(17.))
                .line_height(px(22.))
                .text_color(content(1.))
                .truncate()
                .child(amount(summary)),
        )
        .children(tokens.map(|tokens| {
            div()
                .font_family(mono())
                .text_size(px(10.))
                .line_height(px(14.))
                .text_color(content(0.4))
                .child(tokens)
        }))
}

pub(super) fn bars(
    recent: &Recent,
    range: Range,
    height: f32,
    hover: &crate::home::data::consumption::hover::Hover,
    entrance: u32,
    cx: &mut Context<Home>,
) -> Div {
    let animate = !cx.reduce_motion();
    let heights = bar_heights(&recent.bars);
    let mut row = div()
        .h(px(height + 24.))
        .px_2()
        .flex_shrink_0()
        .flex()
        .items_end()
        .gap(px(3.));
    for (index, ((date, day), fraction)) in recent.bars.iter().zip(heights).enumerate() {
        let today = index + 1 == recent.bars.len();
        let tone = accent_color().opacity(if today { 0.85 } else { 0.35 });
        let target = (fraction * height).max(2.);
        let fill = div().h_full().w_full().rounded_sm().bg(if fraction > 0. {
            tone
        } else {
            content(0.1)
        });
        let from = hover.from(index);
        let to = hover.target(index);
        let highlight = move |fill: Div, t: f32| {
            let strength = from + (to - from) * crate::home::motion::ease_out(t);
            fill.bg(if fraction > 0. {
                accent_color().opacity(
                    if today { 0.85 } else { 0.35 } + (if today { 0.15 } else { 0.6 }) * strength,
                )
            } else {
                content(0.1 + 0.1 * strength)
            })
        };
        let fill = if animate {
            fill.with_animation(
                SharedString::from(format!("consumption-hover-{}-{index}", hover.generation())),
                Animation::new(super::super::super::data::consumption::hover::DURATION),
                highlight,
            )
            .into_any_element()
        } else {
            highlight(fill, 1.).into_any_element()
        };
        let fill = div().w_full().child(fill);
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
        let column = div()
            .id(SharedString::from(format!("home-consumption-day-{index}")))
            .flex_1()
            .flex()
            .flex_col()
            .items_center()
            .justify_end()
            .gap(px(6.))
            .h_full()
            .min_w_0()
            .tooltip(move |_, cx| tooltip::view(title.clone(), summary, cx))
            .on_hover(cx.listener(move |home, active: &bool, _, cx| {
                let reduced = cx.reduce_motion();
                home.feeds.consumption.hover.set(index, *active, reduced);
                cx.notify();
            }))
            .child(
                div()
                    .w_full()
                    .h(px(height))
                    .flex_shrink_0()
                    .flex()
                    .items_end()
                    .child(fill),
            )
            .child(
                div()
                    .font_family(mono())
                    .text_size(px(9.))
                    .line_height(px(12.))
                    .h(px(12.))
                    .flex_shrink_0()
                    .id(SharedString::from(format!("home-consumption-axis-{index}")))
                    .debug_selector(move || format!("home-consumption-axis-{index}"))
                    .text_color(content(if today { 0.7 } else { 0.35 }))
                    .child(range.axis_label(*date, index, recent.bars.len())),
            );
        let backdrop = move |column: gpui::Stateful<Div>, t: f32| {
            let strength = from + (to - from) * crate::home::motion::ease_out(t);
            column.bg(accent_color().opacity(0.07 * strength))
        };
        let column = if animate {
            column
                .with_animation(
                    SharedString::from(format!(
                        "consumption-column-{}-{index}",
                        hover.generation()
                    )),
                    Animation::new(super::super::super::data::consumption::hover::DURATION),
                    backdrop,
                )
                .into_any_element()
        } else {
            backdrop(column, 1.).into_any_element()
        };
        row = row.child(column);
    }

    row
}

pub(super) fn range_selector(range: Range, cx: &mut Context<Home>) -> Div {
    div()
        .h(px(16.))
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
                .line_height(px(12.))
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
