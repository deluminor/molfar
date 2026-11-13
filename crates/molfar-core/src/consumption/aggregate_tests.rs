use super::{
    aggregate::{card_usage, daily, rank, RecordsBySession},
    summary::UsageSummary,
    TokenCounts, UsageRecord,
};
use crate::task_board::types::StageRun;
use chrono::{FixedOffset, NaiveDate};

fn run(id: &str, stage: &str, session: &str, start: i64, end: Option<i64>) -> StageRun {
    StageRun {
        id: id.into(),
        card_id: "card".into(),
        stage: stage.into(),
        attempt: 1,
        session_id: Some(session.into()),
        harness: "codex".into(),
        model: "gpt-6.1-sol".into(),
        settings_json: "{}".into(),
        runtime_mode: "auto".into(),
        template_version: 1,
        dispatch: "settled".into(),
        status: "failed".into(),
        error: None,
        head_before: None,
        porcelain_before: None,
        fingerprint_before: None,
        head_after: None,
        started_at: start,
        completed_at: end,
    }
}

fn record(key: &str, at: Option<u64>, output: u64) -> UsageRecord {
    UsageRecord {
        source_key: key.into(),
        provider: "codex".into(),
        model_id: Some("gpt-6.1-sol".into()),
        model_name: None,
        started_at_ms: at,
        reported_at_ms: at,
        tier: None,
        tokens: Some(TokenCounts {
            output,
            ..Default::default()
        }),
    }
}

#[test]
fn shared_build_session_counts_once_and_splits_by_run_window() {
    let runs = [
        run("grill", "grill", "build", 100, Some(200)),
        run("implement", "implement", "build", 300, Some(400)),
        run("rework", "rework", "build", 500, None),
        run("review", "code_review", "review", 410, Some(450)),
    ];
    let records = RecordsBySession::from([
        (
            "build".into(),
            vec![
                record("g", Some(150), 1),
                record("i", Some(350), 10),
                record("owner", Some(250), 100),
                record("r", Some(900), 1_000),
                record("old", None, 10_000),
            ],
        ),
        ("review".into(), vec![record("cr", Some(420), 100_000)]),
    ]);

    let usage = card_usage(&runs, &records, 1_000).unwrap();

    let outputs: Vec<_> = usage
        .runs
        .iter()
        .map(|run| run.summary.tokens.output)
        .collect();
    assert_eq!(outputs, vec![1, 10, 1_000, 100_000]);
    assert_eq!(usage.other.tokens.output, 10_100);
    assert_eq!(usage.total.tokens.output, 111_111);
    assert_eq!(usage.total.reported_runs, 6);
}

#[test]
fn interrupted_runs_without_reports_stay_visible_as_unreported() {
    let runs = [run("implement", "implement", "build", 0, Some(10))];
    let mut unreported = record("i", Some(5), 0);
    unreported.tokens = None;
    let records = RecordsBySession::from([("build".into(), vec![unreported])]);

    let usage = card_usage(&runs, &records, 20).unwrap();

    assert_eq!(usage.runs[0].summary.unreported_runs, 1);
    assert_eq!(usage.runs[0].status, "failed");
}

#[test]
fn days_follow_the_local_calendar_and_skip_undated_records() {
    let kyiv = FixedOffset::east_opt(2 * 3_600).unwrap();
    let late_utc = 1_794_528_000_000 - 3_600_000;
    let records = [
        record("a", Some(late_utc), 1),
        record("b", Some(late_utc - 86_400_000), 2),
        record("c", None, 4),
    ];

    let days = daily(&records, &kyiv).unwrap();

    assert_eq!(days.len(), 2);
    assert_eq!(days[0].date, NaiveDate::from_ymd_opt(2026, 11, 13).unwrap());
    assert_eq!(days[0].summary.tokens.output, 1);
    assert_eq!(days[1].summary.tokens.output, 2);
}

#[test]
fn rank_orders_by_cost_then_tokens() {
    let summary = |output: u64, model: &str| {
        let mut row = record("x", None, output);
        row.model_id = Some(model.into());
        UsageSummary::of([&row]).unwrap()
    };
    let mut rows = vec![
        ("free", summary(9_000, "unknown")),
        ("cheap", summary(10, "gpt-6.1-sol")),
        ("dear", summary(1_000, "gpt-6.1-sol")),
        ("small", summary(1, "unknown")),
    ];

    rank(&mut rows, |row| &row.1);

    let order: Vec<_> = rows.iter().map(|row| row.0).collect();
    assert_eq!(order, ["dear", "cheap", "free", "small"]);
}
