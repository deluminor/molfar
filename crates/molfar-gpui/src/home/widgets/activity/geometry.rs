use crate::home::data::activity::Cell;
use chrono::{Datelike, NaiveDate};
use std::ops::Range;

pub(super) const GAP: f32 = 3.;
pub(super) const HEADER: f32 = 16.;
pub(super) const DATE_LINE: f32 = 16.;
pub(super) const SUMMARY: f32 = 36.;
const MIN_CELL: f32 = 6.;
const MAX_CELL: f32 = 14.;
pub(super) const MONTH_WIDTH: f32 = 28.;

#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct Fit {
    pub weeks: usize,
    pub cell: f32,
}

impl Fit {
    pub fn width(self) -> f32 {
        (self.weeks as f32 * (self.cell + GAP) - GAP).max(0.)
    }
}

pub(super) fn fit(total_weeks: usize, width: f32, height: f32) -> Fit {
    let rows_cell = ((height - GAP * 6.) / 7.).clamp(0., MAX_CELL);
    let preferred = rows_cell.max(MIN_CELL);
    let weeks = (((width + GAP) / (preferred + GAP)).floor() as usize).clamp(1, total_weeks.max(1));
    let width_cell = ((width - GAP * (weeks as f32 - 1.)) / weeks as f32).max(0.);
    Fit {
        weeks,
        cell: width_cell.min(rows_cell),
    }
}

#[derive(Clone, Copy)]
pub(super) struct Layout {
    pub fit: Fit,
    pub rail: bool,
    pub labels: bool,
    pub summary: bool,
    pub date: bool,
}

pub(super) fn layout(total: usize, width: f32, height: f32) -> Layout {
    let labels = height >= 100. && width >= MONTH_WIDTH;
    let date = height >= 80.;
    let summary = height >= 110.;
    let available =
        height - if labels { HEADER + 4. } else { 0. } - if date { DATE_LINE + 4. } else { 0. };
    let rail = summary && width >= 640.;
    let grid_width = if rail {
        width - (width * 0.32).clamp(180., 320.) - 12.
    } else {
        width
    };
    let grid_height = available - if summary && !rail { SUMMARY + 4. } else { 0. };
    Layout {
        fit: fit(total, grid_width, grid_height),
        rail,
        labels,
        summary,
        date,
    }
}

pub(super) fn observed_range(weeks: &[[Cell; 7]], today: NaiveDate, count: usize) -> Range<usize> {
    let end = weeks
        .iter()
        .position(|week| week.iter().any(|cell| cell.date == today))
        .map_or(weeks.len(), |index| index + 1);
    end.saturating_sub(count)..end
}

pub(super) struct Month {
    pub index: usize,
    pub x: f32,
    pub caption: String,
}

pub(super) fn months(weeks: &[[Cell; 7]], fit: Fit) -> Vec<Month> {
    let mut labels = Vec::new();
    let mut previous = None;
    let mut next_x = 0.;
    for (index, week) in weeks.iter().enumerate() {
        let Some(date) = week
            .iter()
            .find(|cell| cell.in_year && !cell.future)
            .map(|cell| cell.date)
        else {
            continue;
        };
        let month = date.month();
        let x = index as f32 * (fit.cell + GAP);
        if previous != Some(month) && x >= next_x && x + MONTH_WIDTH <= fit.width() {
            labels.push(Month {
                index,
                x,
                caption: date.format("%b").to_string(),
            });
            next_x = x + MONTH_WIDTH + GAP;
        }
        previous = Some(month);
    }
    labels
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::home::data::activity::year;

    #[test]
    fn range_ends_at_current_week_even_early_in_year() {
        for (month, day) in [(1, 2), (3, 10), (11, 4)] {
            let today = NaiveDate::from_ymd_opt(2026, month, day).unwrap();
            let year = year(&[], 2026, today);
            let range = observed_range(&year.weeks, today, 53);
            assert!(
                year.weeks[range.end - 1]
                    .iter()
                    .any(|cell| cell.date == today)
            );
            assert_eq!(range.start, 0);
            assert!(range.end < year.weeks.len());
        }
    }

    #[test]
    fn labels_stay_inside_grid_and_do_not_collide() {
        let today = NaiveDate::from_ymd_opt(2026, 11, 4).unwrap();
        let year = year(&[], 2026, today);
        let range = observed_range(&year.weeks, today, 53);
        for width in [20., 112., 375., 768., 1420.] {
            let fit = fit(range.len(), width, 110.);
            let shown = &year.weeks[range.end - fit.weeks..range.end];
            let labels = months(shown, fit);
            assert!(
                labels
                    .iter()
                    .all(|label| label.x >= 0. && label.x + MONTH_WIDTH <= fit.width())
            );
            assert!(
                labels
                    .windows(2)
                    .all(|pair| pair[0].x + MONTH_WIDTH + GAP <= pair[1].x)
            );
        }
    }

    #[test]
    fn wide_cards_use_rail_and_tiny_geometry_does_not_overflow() {
        assert!(layout(45, 1420., 140.).rail);
        assert!(!layout(45, 375., 140.).rail);
        for width in [700., 920., 1420.] {
            for height in [110., 144., 160., 200.] {
                let sizing = layout(45, width, height);
                assert!(sizing.rail);
                assert!(sizing.fit.width() <= width - 192.);
            }
        }
        for (width, height) in [(60., 30.), (112., 92.), (375., 140.)] {
            let sizing = layout(45, width, height);
            assert!(sizing.fit.width() <= width + 0.01);
            assert!(sizing.fit.cell * 7. + GAP * 6. <= height + 0.01);
        }
    }
}
