use super::*;
use molfar_core::consumption::{TokenCounts, UsageRecord};

fn summary(rows: &[(Option<u64>, &str)]) -> UsageSummary {
    let records: Vec<_> = rows
        .iter()
        .enumerate()
        .map(|(index, (output, model))| UsageRecord {
            source_key: index.to_string(),
            provider: "claude".into(),
            model_id: Some((*model).into()),
            model_name: None,
            started_at_ms: None,
            reported_at_ms: None,
            tier: None,
            tokens: output.map(|output| TokenCounts {
                output,
                ..Default::default()
            }),
        })
        .collect();
    UsageSummary::of(&records).unwrap()
}

#[test]
fn usd_rounds_to_cents_then_whole_grouped_dollars() {
    let cost = |usd: f64| Cost((usd * Cost::SCALE as f64) as u128);
    assert_eq!(usd(cost(0.)), "$0.00");
    assert_eq!(usd(cost(0.004)), "<$0.01");
    assert_eq!(usd(cost(3.404)), "$3.40");
    assert_eq!(usd(cost(1234.6)), "$1,235");
    assert_eq!(usd(cost(1_000_000.)), "$1,000,000");
}

#[test]
fn headlines_name_every_reporting_state() {
    assert_eq!(headline(&summary(&[])), "No usage yet");
    assert_eq!(
        headline(&summary(&[(None, "opus-5-5")])),
        "Usage not reported"
    );
    assert_eq!(
        headline(&summary(&[(Some(1_000_000), "opus-5-5")])),
        "1M tokens · ~$20.00"
    );
    assert_eq!(
        headline(&summary(&[(Some(1_500), "mystery")])),
        "1.5K tokens"
    );
}

#[test]
fn caveats_explain_partial_reports_and_prices() {
    let mixed = summary(&[
        (Some(1_000_000), "opus-5-5"),
        (Some(10), "mystery"),
        (None, "opus-5-5"),
    ]);

    assert_eq!(estimate(&mixed).as_deref(), Some("~$20.00+"));
    assert_eq!(
        caveats(&mixed),
        vec![
            "Partial · 2 of 3 runs reported usage".to_owned(),
            "Known subtotal · 1 of 2 runs priced".to_owned(),
        ]
    );
    assert_eq!(
        caveats(&summary(&[(Some(1), "mystery")])),
        vec!["Cost unavailable for these models".to_owned()]
    );
    assert!(caveats(&summary(&[])).is_empty());
}

#[test]
fn breakdown_skips_empty_categories_and_footnote_dates_the_table() {
    assert_eq!(
        breakdown(&summary(&[(Some(2_000), "opus-5-5")])),
        "output 2K"
    );
    assert_eq!(footnote(), "Estimate · prices as of 13 Nov 2026");
}
