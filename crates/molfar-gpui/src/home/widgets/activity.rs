use super::{
    super::{
        Home, card,
        data::{activity, feeds::Load},
    },
    Body,
    parts::mono,
};
use crate::{task_board::controls, theme::*};
use chrono::{Datelike, Local};
use gpui::{Animation, AnimationExt, AnyElement, Context, Hsla, SharedString, div, prelude::*, px};
use std::time::Duration;

mod geometry;
mod presentation;

use geometry::{GAP, observed_range};

fn shade(level: u8) -> Hsla {
    match level {
        0 => content(0.07),
        1 => accent_color().opacity(0.3),
        2 => accent_color().opacity(0.5),
        3 => accent_color().opacity(0.75),
        _ => accent_color(),
    }
}

impl Home {
    pub(super) fn activity_widget(&self, body: Body, cx: &mut Context<Self>) -> AnyElement {
        let sessions = match &self.feeds.sessions {
            Load::Loading => return card::note("Loading…").into_any_element(),
            Load::Failed(error) => return card::note(error.clone()).into_any_element(),
            Load::Ready(sessions) => sessions,
        };
        let today = Local::now().date_naive();
        let stamps: Vec<u64> = sessions
            .iter()
            .filter(|session| !session.archived)
            .map(|session| session.updated_at)
            .collect();
        let year = activity::year(&stamps, today.year(), today);
        let observed = observed_range(&year.weeks, today, year.weeks.len());
        let layout = geometry::layout(observed.len(), body.w, body.h);
        let range = observed_range(&year.weeks, today, layout.fit.weeks);
        let shown = &year.weeks[range];
        let fit = layout.fit;
        let animate = !cx.reduce_motion();
        let annual = format!(
            "{} · {} updated sessions · {} active days; grouped by latest session update",
            year.year, year.sessions, year.active_days
        );

        let (updates, active_days) = activity::totals(shown);
        let (today_updates, seven_days) = activity::recent_totals(&stamps, today);
        let summary =
            presentation::summary(today_updates, seven_days, updates, active_days, layout.rail);
        let mut columns = div().flex().gap(px(GAP));
        for (index, week) in shown.iter().enumerate() {
            let mut column = div().flex().flex_col().gap(px(GAP));
            for cell in week {
                let date = cell.date;
                let count = cell.count;
                let visible = cell.in_year && !cell.future;
                let square = div()
                    .id(SharedString::from(format!("home-day-{date}")))
                    .debug_selector(move || format!("home-day-{date}"))
                    .size(px(fit.cell))
                    .rounded(px((fit.cell / 6.).min(2.)))
                    .border_1()
                    .border_color(if date == today {
                        content(0.8)
                    } else {
                        gpui::transparent_black()
                    })
                    .bg(if visible {
                        shade(cell.level)
                    } else {
                        gpui::transparent_black()
                    })
                    .when(visible, |square| {
                        square.tooltip(move |_, cx| {
                            let sessions = if count == 1 {
                                "updated session"
                            } else {
                                "updated sessions"
                            };
                            controls::hint(
                                format!("{} · {count} {sessions}", date.format("%b %-d")),
                                cx,
                            )
                        })
                    });
                column = column.child(square);
            }
            columns = columns.child(if animate {
                let delay = index as f32 / shown.len().max(1) as f32 * 0.5;
                column
                    .with_animation(
                        ("home-activity-week", (self.entrance as usize) << 8 | index),
                        Animation::new(Duration::from_millis(700)),
                        move |column, t| column.opacity(((t - delay) / (1. - delay)).clamp(0., 1.)),
                    )
                    .into_any_element()
            } else {
                column.into_any_element()
            });
        }

        let start = shown
            .iter()
            .flatten()
            .find(|cell| cell.in_year)
            .map_or(today, |cell| cell.date);
        let grid = div()
            .flex_shrink_0()
            .w(px(fit.width()))
            .flex()
            .flex_col()
            .gap_1()
            .when(layout.labels, |grid| {
                grid.child(presentation::month_header(shown, fit))
            })
            .child(columns)
            .when(layout.date, |grid| {
                grid.child(
                    div()
                        .id("home-activity-date-range")
                        .h(px(geometry::DATE_LINE))
                        .flex_shrink_0()
                        .flex()
                        .justify_between()
                        .gap_2()
                        .text_size(px(9.))
                        .text_color(content(0.6))
                        .tooltip(move |_, cx| controls::hint(annual.clone(), cx))
                        .child(div().truncate().child(format!(
                            "{} – {} · latest updates",
                            start.format("%d %b"),
                            today.format("%d %b %Y")
                        )))
                        .when(fit.width() >= 350., |row| row.child(presentation::legend())),
                )
            });

        div()
            .size_full()
            .overflow_hidden()
            .font_family(mono())
            .flex()
            .gap_3()
            .when(layout.rail, |widget| widget.flex_row().items_start())
            .when(!layout.rail, |widget| {
                widget.flex_col().justify_between().gap_1()
            })
            .child(grid)
            .when(layout.summary, |widget| widget.child(summary))
            .into_any_element()
    }
}

#[cfg(test)]
#[path = "activity/regression_tests.rs"]
mod regression_tests;
