use super::*;
use molfar_core::consumption::{TokenCounts, UsageRecord};

fn day(date: NaiveDate, model: &str, output: u64) -> DayUsage {
    let record = UsageRecord {
        source_key: date.to_string(),
        provider: "codex".into(),
        model_id: Some(model.into()),
        model_name: None,
        started_at_ms: None,
        reported_at_ms: None,
        tier: None,
        tokens: Some(TokenCounts {
            output,
            ..Default::default()
        }),
    };
    DayUsage {
        date,
        summary: UsageSummary::of([&record]).unwrap(),
    }
}

fn date(day: u32) -> NaiveDate {
    NaiveDate::from_ymd_opt(2026, 11, day).unwrap()
}

#[test]
fn month_keeps_days_oldest_first_and_ignores_other_months() {
    let days = [
        day(date(13), "gpt-6.1-sol", 100),
        day(date(10), "gpt-6.1-sol", 10),
        day(
            NaiveDate::from_ymd_opt(2026, 10, 31).unwrap(),
            "gpt-6.1-sol",
            1_000,
        ),
    ];

    let recent = recent(&days, date(13), Range::Month).unwrap();

    assert_eq!(recent.bars.len(), 13);
    assert_eq!(recent.bars[0].0, date(1));
    assert_eq!(recent.bars[12].0, date(13));
    assert_eq!(recent.today.tokens.output, 100);
    assert_eq!(recent.total.tokens.output, 110);
}

#[test]
fn bars_scale_by_cost_when_priced_and_by_tokens_otherwise() {
    let priced = recent(
        &[
            day(date(13), "gpt-6.1-sol", 100),
            day(date(12), "gpt-6.1-sol", 50),
        ],
        date(13),
        Range::Month,
    )
    .unwrap();
    let heights = bar_heights(&priced.bars);
    assert_eq!(heights[12], 1.);
    assert_eq!(heights[11], 0.5);
    assert_eq!(heights[0], 0.);

    let unpriced = recent(
        &[day(date(13), "mystery", 40), day(date(11), "mystery", 10)],
        date(13),
        Range::Month,
    )
    .unwrap();
    assert_eq!(bar_heights(&unpriced.bars)[10], 0.25);

    assert!(
        bar_heights(&recent(&[], date(13), Range::Month).unwrap().bars)
            .iter()
            .all(|height| *height == 0.)
    );
}

#[test]
fn year_merges_months_and_excludes_future_and_previous_year() {
    let jan = NaiveDate::from_ymd_opt(2026, 1, 15).unwrap();
    let days = [
        day(jan, "gpt-6.1-sol", 20),
        day(date(1), "gpt-6.1-sol", 30),
        day(date(13), "gpt-6.1-sol", 40),
        day(date(14), "gpt-6.1-sol", 1000),
        day(
            NaiveDate::from_ymd_opt(2025, 12, 31).unwrap(),
            "gpt-6.1-sol",
            1000,
        ),
    ];
    let recent = recent(&days, date(13), Range::Year).unwrap();
    assert_eq!(recent.bars.len(), 11);
    assert_eq!(recent.bars[0].1.tokens.output, 20);
    assert_eq!(recent.bars[10].1.tokens.output, 70);
    assert_eq!(recent.today.tokens.output, 40);
    assert_eq!(recent.total.tokens.output, 90);
    assert_eq!(recent.bars[1].1, UsageSummary::default());
}

#[test]
fn calendar_handles_leap_day_and_first_day_of_year() {
    let leap = NaiveDate::from_ymd_opt(2024, 2, 29).unwrap();
    let month = recent(&[], leap, Range::Month).unwrap();
    assert_eq!(month.bars.len(), 29);
    assert_eq!(month.bars.last().unwrap().0, leap);
    let first = NaiveDate::from_ymd_opt(2026, 1, 1).unwrap();
    for range in [Range::Month, Range::Year] {
        let empty = recent(&[], first, range).unwrap();
        assert_eq!(empty.bars.len(), 1);
        assert_eq!(empty.total, UsageSummary::default());
    }
    assert_eq!(Range::default(), Range::Month);
}

#[test]
fn period_aggregation_reports_overflow() {
    let days = [
        day(date(12), "mystery", u64::MAX),
        day(date(13), "mystery", 1),
    ];
    for range in [Range::Month, Range::Year] {
        assert_eq!(
            recent(&days, date(13), range).unwrap_err(),
            "Usage total overflows while merging"
        );
    }
}
