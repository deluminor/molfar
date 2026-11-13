use super::{TokenCounts, UsageRecord, UsageSlice};
use crate::agent::{turn::TurnCompletion, TurnInfo, TurnMetrics};

fn one(mut records: Vec<UsageRecord>) -> UsageRecord {
    assert_eq!(records.len(), 1, "{records:?}");
    records.remove(0)
}

fn receipt() -> TurnInfo {
    TurnInfo {
        receipt_id: Some("receipt-1".into()),
        provider: "codex".into(),
        model: "GPT-6.1-Sol".into(),
        model_id: Some("gpt-6.1-sol".into()),
        started_at: Some(1_000),
        completed_at: Some(4_000),
        metrics: Some(TurnMetrics {
            input_tokens: 120,
            output_tokens: 30,
            cache_read_tokens: 100,
            ..Default::default()
        }),
        ..Default::default()
    }
}

#[test]
fn live_receipt_keeps_raw_counters_identity_and_report_time() {
    let record = one(UsageRecord::from_turn(&receipt()));

    assert_eq!(record.source_key, "receipt-1");
    assert_eq!(record.model_id.as_deref(), Some("gpt-6.1-sol"));
    assert_eq!(record.model_name.as_deref(), Some("GPT-6.1-Sol"));
    assert_eq!(record.reported_at_ms, Some(4_000));
    assert_eq!(
        record.tokens,
        Some(TokenCounts {
            input: 120,
            output: 30,
            cache_read: 100,
            cache_write: 0,
            cache_write_1h: None,
        })
    );
}

#[test]
fn unreported_and_interrupted_runs_are_recorded_without_tokens() {
    let mut info = receipt();
    info.metrics = None;
    assert_eq!(one(UsageRecord::from_turn(&info)).tokens, None);

    info.metrics = Some(TurnMetrics::default());
    assert_eq!(one(UsageRecord::from_turn(&info)).tokens, None);
}

#[test]
fn joined_steers_and_receipts_without_identity_are_skipped() {
    let mut joined = receipt();
    joined.joined_turn = Some(2);
    assert!(UsageRecord::from_turn(&joined).is_empty());
    assert!(UsageRecord::from_saved(&joined).is_empty());

    let mut anonymous = receipt();
    anonymous.receipt_id = None;
    assert!(UsageRecord::from_turn(&anonymous).is_empty());
}

#[test]
fn saved_receipts_reuse_live_identity_and_key_legacy_runs_by_start() {
    let mut running = receipt();
    assert!(UsageRecord::from_saved(&running).is_empty());

    running.completion = Some(TurnCompletion::Cancelled {
        completed_at: 4_000,
    });
    assert_eq!(
        one(UsageRecord::from_saved(&running)).source_key,
        "receipt-1"
    );

    let mut legacy = receipt();
    legacy.receipt_id = None;
    assert_eq!(
        one(UsageRecord::from_saved(&legacy)).source_key,
        "legacy:1000"
    );

    legacy.started_at = None;
    assert!(UsageRecord::from_saved(&legacy).is_empty());
}

#[test]
fn validation_rejects_missing_identity_and_overflowing_counts() {
    let mut record = one(UsageRecord::from_turn(&receipt()));
    record.source_key = " ".into();
    assert!(record.validate().is_err());

    let mut record = one(UsageRecord::from_turn(&receipt()));
    record.tokens = Some(TokenCounts {
        input: i64::MAX as u64,
        output: i64::MAX as u64,
        cache_read: i64::MAX as u64,
        cache_write: 0,
        cache_write_1h: None,
    });
    assert!(record.validate().unwrap_err().contains("overflows"));

    record.tokens = Some(TokenCounts {
        input: u64::MAX,
        ..Default::default()
    });
    assert!(record.validate().unwrap_err().contains("SQLite"));
}

#[test]
fn model_slices_become_one_record_each_under_the_same_receipt() {
    let slice = |model: &str, output: u64| UsageSlice {
        model: model.into(),
        tokens: TokenCounts {
            output,
            cache_write: 10,
            cache_write_1h: Some(10),
            ..Default::default()
        },
    };
    let mut info = receipt();
    info.provider = "claude".into();
    info.service_tier = Some("fast".into());
    info.usage_slices = vec![slice("claude-opus-5-5", 4), slice("claude-haiku-4-5", 9)];
    info.completion = Some(TurnCompletion::Succeeded {
        completed_at: 4_000,
    });

    let live = UsageRecord::from_turn(&info);
    let saved = UsageRecord::from_saved(&info);

    assert_eq!(live, saved);
    let keys: Vec<_> = live
        .iter()
        .map(|record| record.source_key.as_str())
        .collect();
    assert_eq!(
        keys,
        ["receipt-1#claude-opus-5-5", "receipt-1#claude-haiku-4-5"]
    );
    assert_eq!(live[1].model_id.as_deref(), Some("claude-haiku-4-5"));
    assert_eq!(live[1].model_name, None);
    assert_eq!(live[1].tier.as_deref(), Some("fast"));
    assert_eq!(live[1].tokens.unwrap().output, 9);
}

#[test]
fn validation_rejects_more_long_cache_writes_than_writes() {
    let mut record = one(UsageRecord::from_turn(&receipt()));
    record.tokens = Some(TokenCounts {
        cache_write: 1,
        cache_write_1h: Some(2),
        ..Default::default()
    });

    assert!(record.validate().unwrap_err().contains("one-hour"));
}
