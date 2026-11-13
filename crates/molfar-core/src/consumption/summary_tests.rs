use super::{
    summary::{Pricing, Reporting, UsageSummary},
    TokenCounts, UsageRecord,
};

fn record(key: &str, model: &str, tokens: Option<TokenCounts>) -> UsageRecord {
    UsageRecord {
        source_key: key.into(),
        provider: "claude".into(),
        model_id: Some(model.into()),
        model_name: None,
        started_at_ms: None,
        reported_at_ms: None,
        tier: None,
        tokens,
    }
}

fn tokens(output: u64) -> Option<TokenCounts> {
    Some(TokenCounts {
        output,
        ..Default::default()
    })
}

#[test]
fn empty_unreported_and_complete_projections_are_distinct() {
    let empty = UsageSummary::of([]).unwrap();
    assert_eq!(empty.reporting(), Reporting::Empty);
    assert_eq!(empty.pricing(), Pricing::Unavailable);

    let unreported = UsageSummary::of([&record("a", "opus-5-5", None)]).unwrap();
    assert_eq!(unreported.reporting(), Reporting::NotReported);

    let zero = UsageSummary::of([&record("a", "opus-5-5", tokens(0))]).unwrap();
    assert_eq!(zero.reporting(), Reporting::Complete);
    assert_eq!(zero.pricing(), Pricing::Complete);
    assert_eq!(zero.total_tokens(), 0);
}

#[test]
fn mixed_coverage_keeps_a_known_subtotal_and_flags_partial_states() {
    let records = [
        record("a", "opus-5-5", tokens(1_000_000)),
        record("b", "mystery", tokens(500)),
        record("c", "opus-5-5", None),
    ];

    let summary = UsageSummary::of(&records).unwrap();

    assert_eq!(summary.total_tokens(), 1_000_500);
    assert_eq!(summary.cost.usd(), 20.0);
    assert_eq!(summary.reporting(), Reporting::Partial);
    assert_eq!(summary.pricing(), Pricing::Partial);
}

#[test]
fn overflowing_totals_fail_with_the_offending_source() {
    let huge = tokens(u64::MAX / 2 + 1);
    let records = [record("a", "x", huge), record("b", "x", huge)];

    let error = UsageSummary::of(&records).unwrap_err();

    assert!(error.contains("source=b"), "{error}");
}
