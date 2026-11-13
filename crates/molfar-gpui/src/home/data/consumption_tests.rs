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
fn recent_keeps_seven_days_oldest_first_and_ignores_older_days() {
    let days = [
        day(date(13), "gpt-6.1-sol", 100),
        day(date(10), "gpt-6.1-sol", 10),
        day(date(1), "gpt-6.1-sol", 1_000),
    ];

    let recent = recent(&days, date(13)).unwrap();

    assert_eq!(recent.bars.len(), WEEK);
    assert_eq!(recent.bars[0].0, date(7));
    assert_eq!(recent.bars[6].0, date(13));
    assert_eq!(recent.today.tokens.output, 100);
    assert_eq!(recent.week.tokens.output, 110);
}

#[test]
fn bars_scale_by_cost_when_priced_and_by_tokens_otherwise() {
    let priced = recent(
        &[
            day(date(13), "gpt-6.1-sol", 100),
            day(date(12), "gpt-6.1-sol", 50),
        ],
        date(13),
    )
    .unwrap();
    let heights = bar_heights(&priced.bars);
    assert_eq!(heights[6], 1.);
    assert_eq!(heights[5], 0.5);
    assert_eq!(heights[0], 0.);

    let unpriced = recent(
        &[day(date(13), "mystery", 40), day(date(11), "mystery", 10)],
        date(13),
    )
    .unwrap();
    assert_eq!(bar_heights(&unpriced.bars)[4], 0.25);

    assert!(
        bar_heights(&recent(&[], date(13)).unwrap().bars)
            .iter()
            .all(|height| *height == 0.)
    );
}
