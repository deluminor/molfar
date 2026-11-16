use super::{
    geometry::{Fit, HEADER, MONTH_WIDTH, months},
    shade,
};
use crate::{home::data::activity::Cell, theme::*};
use gpui::{Div, SharedString, Stateful, div, prelude::*, px};

pub(super) fn month_header(weeks: &[[Cell; 7]], fit: Fit) -> Stateful<Div> {
    let mut header = div()
        .id("home-month-header")
        .debug_selector(|| "home-month-header".into())
        .relative()
        .w(px(fit.width()))
        .h(px(HEADER))
        .flex_shrink_0();
    for month in months(weeks, fit) {
        let index = month.index;
        header = header.child(
            div()
                .id(SharedString::from(format!("home-month-{index}")))
                .debug_selector(move || format!("home-month-{index}"))
                .absolute()
                .left(px(month.x))
                .top_0()
                .w(px(MONTH_WIDTH))
                .h(px(HEADER))
                .whitespace_nowrap()
                .text_size(px(9.))
                .line_height(px(HEADER))
                .text_color(content(0.65))
                .child(month.caption),
        );
    }
    header
}

pub(super) fn summary(
    today: u32,
    seven_days: u32,
    updates: u32,
    active_days: usize,
    rail: bool,
) -> Stateful<Div> {
    let mut summary = div()
        .id("home-activity-summary")
        .debug_selector(|| "home-activity-summary".into())
        .flex()
        .min_w_0()
        .when(rail, |row| {
            row.flex_1()
                .h_full()
                .flex_col()
                .justify_between()
                .pl_4()
                .border_l_1()
                .border_color(content(0.1))
        })
        .when(!rail, |row| row.w_full().justify_between().gap_2());
    for (label, count) in [
        ("Today", today),
        ("7 days", seven_days),
        ("Visible period", updates),
    ] {
        summary = summary.child(
            div()
                .flex()
                .min_w_0()
                .when(rail, |metric| {
                    metric.w_full().justify_between().items_baseline().gap_2()
                })
                .when(!rail, |metric| metric.flex_col().gap_1())
                .child(
                    div()
                        .text_size(px(9.))
                        .text_color(content(0.6))
                        .truncate()
                        .child(label),
                )
                .child(
                    div()
                        .text_size(px(17.))
                        .line_height(px(18.))
                        .text_color(accent_color())
                        .child(count.to_string()),
                ),
        );
    }
    summary.when(rail, |summary| {
        summary.child(
            div()
                .text_size(px(10.))
                .text_color(content(0.6))
                .child(format!("{active_days} active days · latest update dates")),
        )
    })
}

pub(super) fn legend() -> Div {
    let mut row = div().flex().items_center().gap_1().child("Less");
    for level in 0..=4 {
        row = row.child(div().size(px(6.)).rounded(px(1.)).bg(shade(level)));
    }
    row.child("More")
}
