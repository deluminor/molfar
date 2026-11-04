//! Year heatmap of session updates, ported from session-activity.ts.
use chrono::{Datelike, Duration, Local, NaiveDate, TimeZone};
use std::collections::HashMap;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct Cell {
    pub date: NaiveDate,
    pub count: u32,
    pub level: u8,
    pub in_year: bool,
    pub future: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct Year {
    pub year: i32,
    /// Sunday-first columns; padding days outside the year keep columns aligned.
    pub weeks: Vec<[Cell; 7]>,
    pub active_days: u32,
    pub sessions: u32,
}

/// Absolute bands, so a quiet year never looks busy.
pub(crate) fn level(count: u32) -> u8 {
    match count {
        0 => 0,
        1 => 1,
        2..=3 => 2,
        4..=6 => 3,
        _ => 4,
    }
}

pub(crate) fn local_day(ms: u64) -> Option<NaiveDate> {
    let ms = i64::try_from(ms).ok()?;
    Local
        .timestamp_millis_opt(ms)
        .single()
        .map(|time| time.date_naive())
}

pub(crate) fn year(timestamps: &[u64], year: i32, today: NaiveDate) -> Year {
    let mut counts: HashMap<NaiveDate, u32> = HashMap::new();
    for day in timestamps.iter().filter_map(|ms| local_day(*ms)) {
        if day.year() == year {
            *counts.entry(day).or_default() += 1;
        }
    }

    let first = NaiveDate::from_ymd_opt(year, 1, 1).expect("valid year");
    let last = NaiveDate::from_ymd_opt(year, 12, 31).expect("valid year");
    let start = first - Duration::days(i64::from(first.weekday().num_days_from_sunday()));
    let end = last + Duration::days(i64::from(6 - last.weekday().num_days_from_sunday()));

    let mut weeks = Vec::new();
    let (mut active_days, mut sessions) = (0, 0);
    let mut cursor = start;
    while cursor <= end {
        let week = std::array::from_fn(|offset| {
            let date = cursor + Duration::days(offset as i64);
            let in_year = date.year() == year;
            let future = in_year && date > today;
            let count = if in_year && !future {
                counts.get(&date).copied().unwrap_or(0)
            } else {
                0
            };
            if count > 0 {
                active_days += 1;
                sessions += count;
            }
            Cell {
                date,
                count,
                level: level(count),
                in_year,
                future,
            }
        });
        weeks.push(week);
        cursor += Duration::days(7);
    }

    Year {
        year,
        weeks,
        active_days,
        sessions,
    }
}

#[cfg(test)]
mod tests {
    use super::{level, year};
    use chrono::{Local, NaiveDate, TimeZone};

    fn at(y: i32, m: u32, d: u32) -> u64 {
        Local
            .with_ymd_and_hms(y, m, d, 12, 0, 0)
            .single()
            .unwrap()
            .timestamp_millis() as u64
    }

    #[test]
    fn bands_are_absolute() {
        assert_eq!(
            [0, 1, 2, 3, 4, 6, 7, 50].map(level),
            [0, 1, 2, 2, 3, 3, 4, 4]
        );
    }

    #[test]
    fn year_grid_counts_days_and_hides_the_future() {
        let today = NaiveDate::from_ymd_opt(2026, 3, 10).unwrap();
        let stamps = [
            at(2026, 1, 1),
            at(2026, 1, 1),
            at(2026, 3, 10),
            at(2026, 3, 11),
            at(2025, 12, 31),
        ];

        let grid = year(&stamps, 2026, today);

        assert_eq!(grid.active_days, 2);
        assert_eq!(grid.sessions, 3);
        assert!(grid.weeks.iter().all(|week| week.len() == 7));
        assert!(grid.weeks.len() >= 53);
        let first = grid.weeks[0].iter().find(|cell| cell.in_year).unwrap();
        assert_eq!(first.date, NaiveDate::from_ymd_opt(2026, 1, 1).unwrap());
        assert_eq!(first.count, 2);
        let future = grid
            .weeks
            .iter()
            .flatten()
            .find(|cell| cell.date == NaiveDate::from_ymd_opt(2026, 3, 11).unwrap())
            .unwrap();
        assert!(future.future);
        assert_eq!(future.count, 0);
        assert!(!grid.weeks[0][0].in_year);
    }
}
