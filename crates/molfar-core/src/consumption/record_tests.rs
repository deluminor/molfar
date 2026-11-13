use super::{TokenCounts, UsageRecord};
use crate::agent::{turn::TurnCompletion, TurnInfo, TurnMetrics};

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
    let record = UsageRecord::from_turn(&receipt()).unwrap();

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
            cache_write: 0
        })
    );
}

#[test]
fn unreported_and_interrupted_runs_are_recorded_without_tokens() {
    let mut info = receipt();
    info.metrics = None;
    assert_eq!(UsageRecord::from_turn(&info).unwrap().tokens, None);

    info.metrics = Some(TurnMetrics::default());
    assert_eq!(UsageRecord::from_turn(&info).unwrap().tokens, None);
}

#[test]
fn joined_steers_and_receipts_without_identity_are_skipped() {
    let mut joined = receipt();
    joined.joined_turn = Some(2);
    assert!(UsageRecord::from_turn(&joined).is_none());
    assert!(UsageRecord::from_saved(&joined).is_none());

    let mut anonymous = receipt();
    anonymous.receipt_id = None;
    assert!(UsageRecord::from_turn(&anonymous).is_none());
}

#[test]
fn saved_receipts_reuse_live_identity_and_key_legacy_runs_by_start() {
    let mut running = receipt();
    assert!(UsageRecord::from_saved(&running).is_none());

    running.completion = Some(TurnCompletion::Cancelled {
        completed_at: 4_000,
    });
    assert_eq!(
        UsageRecord::from_saved(&running).unwrap().source_key,
        "receipt-1"
    );

    let mut legacy = receipt();
    legacy.receipt_id = None;
    assert_eq!(
        UsageRecord::from_saved(&legacy).unwrap().source_key,
        "legacy:1000"
    );

    legacy.started_at = None;
    assert!(UsageRecord::from_saved(&legacy).is_none());
}

#[test]
fn validation_rejects_missing_identity_and_overflowing_counts() {
    let mut record = UsageRecord::from_turn(&receipt()).unwrap();
    record.source_key = " ".into();
    assert!(record.validate().is_err());

    let mut record = UsageRecord::from_turn(&receipt()).unwrap();
    record.tokens = Some(TokenCounts {
        input: i64::MAX as u64,
        output: i64::MAX as u64,
        cache_read: i64::MAX as u64,
        cache_write: 0,
    });
    assert!(record.validate().unwrap_err().contains("overflows"));

    record.tokens = Some(TokenCounts {
        input: u64::MAX,
        ..Default::default()
    });
    assert!(record.validate().unwrap_err().contains("SQLite"));
}
