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

const GAP: f32 = 3.;
const MIN_CELL: f32 = 6.;
const MAX_CELL: f32 = 18.;
const FOOTER: f32 = 18.;

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct Fit {
    pub weeks: usize,
    pub cell: f32,
}

/// The most recent weeks that fit, with square cells as large as the card allows.
pub(crate) fn fit(total_weeks: usize, width: f32, height: f32) -> Fit {
    let rows_cell = ((height - GAP * 6.) / 7.).clamp(MIN_CELL, MAX_CELL);
    let weeks = (((width + GAP) / (MIN_CELL + GAP)).floor() as usize).clamp(1, total_weeks.max(1));
    let width_cell = (width - GAP * (weeks as f32 - 1.)) / weeks as f32;
    Fit {
        weeks,
        cell: width_cell.min(rows_cell).max(MIN_CELL.min(width_cell)),
    }
}

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
        let footer = body.h >= 7. * MIN_CELL + 6. * GAP + FOOTER;
        let grid_height = if footer { body.h - FOOTER } else { body.h };
        let fit = fit(year.weeks.len(), body.w, grid_height);
        let current_week = year
            .weeks
            .iter()
            .position(|week| week.iter().any(|cell| cell.date == today))
            .unwrap_or(year.weeks.len() - 1);
        let last = (current_week + 1).max(fit.weeks).min(year.weeks.len());
        let shown = &year.weeks[last - fit.weeks..last];
        let animate = !cx.reduce_motion();

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
                    .rounded(px((fit.cell / 4.).min(3.)))
                    .bg(if visible {
                        shade(cell.level)
                    } else {
                        gpui::transparent_black()
                    })
                    .when(visible, |square| {
                        square.tooltip(move |_, cx| {
                            let sessions = if count == 1 { "session" } else { "sessions" };
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

        div()
            .size_full()
            .flex()
            .flex_col()
            .justify_between()
            .gap_1()
            .child(div().flex().justify_end().child(columns))
            .when(footer, |widget| {
                widget.child(
                    div()
                        .h(px(FOOTER))
                        .flex()
                        .items_center()
                        .justify_between()
                        .font_family(mono())
                        .text_size(px(10.))
                        .text_color(content(0.45))
                        .child(format!("{} · {} active days", year.year, year.active_days))
                        .child(format!("{} sessions", year.sessions)),
                )
            })
            .into_any_element()
    }
}

#[cfg(test)]
mod tests {
    use super::{GAP, MAX_CELL, MIN_CELL, fit};

    #[test]
    fn heatmap_shows_more_weeks_as_it_widens_and_caps_cell_size() {
        let narrow = fit(53, 200., 120.);
        let wide = fit(53, 1200., 120.);
        assert!(narrow.weeks < wide.weeks);
        assert_eq!(wide.weeks, 53);
        assert!(narrow.weeks as f32 * (narrow.cell + GAP) - GAP <= 200. + 0.01);
        assert!(wide.cell <= MAX_CELL);
        assert!(fit(53, 60., 30.).cell >= MIN_CELL.min(60.));
    }
}
