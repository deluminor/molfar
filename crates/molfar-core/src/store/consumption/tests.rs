use crate::{
    consumption::{TokenCounts, UsageRecord},
    store::Store,
};

fn record() -> UsageRecord {
    UsageRecord {
        source_key: "receipt-1".into(),
        provider: "claude".into(),
        model_id: Some("opus".into()),
        model_name: Some("Opus 5.5".into()),
        started_at_ms: Some(500),
        reported_at_ms: Some(1_000),
        tokens: Some(TokenCounts {
            input: 0,
            output: 4,
            cache_read: 0,
            cache_write: 0,
        }),
    }
}

#[test]
fn replayed_reports_replace_one_row_and_keep_the_first_date_after_reopen() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("usage.db");
    let store = Store::open(&path).unwrap();
    let mut saved = record();
    store.save_consumption(42, &saved).unwrap();
    store.save_consumption(42, &saved).unwrap();
    saved.tokens.as_mut().unwrap().output = 9;
    saved.reported_at_ms = Some(2_000);
    store.save_consumption(42, &saved).unwrap();
    drop(store);

    let store = Store::open(&path).unwrap();
    let rows = store.session_consumption(42).unwrap();

    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].tokens.unwrap().output, 9);
    assert_eq!(rows[0].tokens.unwrap().input, 0);
    assert_eq!(rows[0].reported_at_ms, Some(1_000));
    assert!(store.session_consumption(43).unwrap().is_empty());
}

#[test]
fn unreported_runs_round_trip_without_counters() {
    let store = Store::open(std::path::Path::new(":memory:")).unwrap();
    let mut unreported = record();
    unreported.tokens = None;
    store.save_consumption(1, &unreported).unwrap();

    assert_eq!(store.session_consumption(1).unwrap(), vec![unreported]);
}

#[test]
fn invalid_counts_are_rejected_and_preserve_saved_usage() {
    let store = Store::open(std::path::Path::new(":memory:")).unwrap();
    store.save_consumption(1, &record()).unwrap();
    let mut invalid = record();
    invalid.tokens.as_mut().unwrap().input = u64::MAX;

    let error = store.save_consumption(1, &invalid).unwrap_err();

    assert!(error.contains("receipt-1"));
    assert_eq!(store.session_consumption(1).unwrap(), vec![record()]);
}

#[test]
fn empty_store_reads_without_creating_accounting_tables() {
    let store = Store::open(std::path::Path::new(":memory:")).unwrap();
    assert!(store.session_consumption(1).unwrap().is_empty());

    let tables: i64 = store
        .conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE name='native_consumption_v1'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(tables, 0);
}

#[test]
fn database_failure_reports_context_and_keeps_previous_report() {
    let store = Store::open(std::path::Path::new(":memory:")).unwrap();
    store.save_consumption(1, &record()).unwrap();
    store
        .conn
        .execute_batch(
            "CREATE TRIGGER reject_consumption BEFORE UPDATE ON native_consumption_v1
             BEGIN SELECT RAISE(ABORT, 'fixture write failure'); END;",
        )
        .unwrap();
    let mut next = record();
    next.tokens.as_mut().unwrap().output = 99;

    let error = store.save_consumption(1, &next).unwrap_err();

    assert!(error.contains("session=1"));
    assert!(error.contains("fixture write failure"));
    assert_eq!(store.session_consumption(1).unwrap(), vec![record()]);
    store
        .conn
        .execute_batch("DROP TRIGGER reject_consumption")
        .unwrap();
    store.save_consumption(1, &next).unwrap();
    assert_eq!(store.session_consumption(1).unwrap(), vec![next]);
}

#[test]
fn shared_database_uses_persisted_session_identity() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("desktop.db");
    let store = Store::open_desktop(&path).unwrap();
    let session = store.create("codex", "/fixture").unwrap();
    let identity = store.persisted_session_id(session.id).unwrap();
    store.save_consumption(session.id, &record()).unwrap();

    let saved_identity: String = store
        .conn
        .query_row("SELECT session_id FROM native_consumption_v1", [], |row| {
            row.get(0)
        })
        .unwrap();
    assert_eq!(saved_identity, identity);
    drop(store);

    let store = Store::open_desktop(&path).unwrap();
    let session = store
        .sessions()
        .unwrap()
        .into_iter()
        .find(|session| store.persisted_session_id(session.id).unwrap() == identity)
        .unwrap();
    assert_eq!(
        store.session_consumption(session.id).unwrap(),
        vec![record()]
    );
}
