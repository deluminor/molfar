use chrono::{Datelike, Days, NaiveDate};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub(crate) enum Range {
    #[default]
    Month,
    Year,
}

impl Range {
    pub(crate) fn label(self) -> &'static str {
        match self {
            Self::Month => "Month",
            Self::Year => "Year",
        }
    }

    pub(super) fn bucket(self, date: NaiveDate) -> NaiveDate {
        match self {
            Self::Month => date,
            Self::Year => date.with_day(1).unwrap_or(date),
        }
    }

    pub(super) fn dates(self, today: NaiveDate) -> Vec<NaiveDate> {
        match self {
            Self::Month => (0..today.day())
                .rev()
                .filter_map(|back| today.checked_sub_days(Days::new(u64::from(back))))
                .collect(),
            Self::Year => (1..=today.month())
                .filter_map(|month| NaiveDate::from_ymd_opt(today.year(), month, 1))
                .collect(),
        }
    }

    pub(crate) fn axis_label(self, date: NaiveDate, index: usize, count: usize) -> String {
        match self {
            Self::Year if count <= 6 || index.is_multiple_of(2) || index + 1 == count => {
                date.format("%b").to_string()
            }
            Self::Year => String::new(),
            Self::Month if index == 0 || index + 1 == count => date.format("%-d").to_string(),
            Self::Month if date.day().is_multiple_of(5) && index + 3 < count => {
                date.format("%-d").to_string()
            }
            Self::Month => String::new(),
        }
    }

    pub(crate) fn title(self, date: NaiveDate) -> String {
        match self {
            Self::Month => date.format("%a, %-d %B %Y").to_string(),
            Self::Year => date.format("%B %Y").to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn month_axis_keeps_space_before_the_final_label() {
        let date = |day| NaiveDate::from_ymd_opt(2026, 1, day).unwrap();
        assert_eq!(Range::Month.axis_label(date(25), 24, 31), "25");
        assert_eq!(Range::Month.axis_label(date(30), 29, 31), "");
        assert_eq!(Range::Month.axis_label(date(31), 30, 31), "31");
        assert_eq!(Range::Month.axis_label(date(1), 0, 1), "1");
    }
}
