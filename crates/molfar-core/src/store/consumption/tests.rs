use crate::{consumption::UsageSnapshot, store::Store};

fn snapshot() -> UsageSnapshot {
    UsageSnapshot {
        source_key: "run-1:message-1".into(),
        provider: "fixture".into(),
        model: None,
        reported_at_ms: Some(1000),
        input: Some(0),
        output: Some(4),
        cache_read: None,
        cache_write: None,
    }
}

#[test]
fn snapshots_replace_without_losing_presence_or_first_date_after_reopen() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("usage.db");
    let store = Store::open(&path).unwrap();
    let mut record = snapshot();
    store.save_consumption(42, &record).unwrap();
    store.save_consumption(42, &record).unwrap();
    record.output = Some(9);
    record.reported_at_ms = Some(2000);
    store.save_consumption(42, &record).unwrap();
    drop(store);

    let store = Store::open(&path).unwrap();
    let saved = store.session_consumption(42).unwrap();
    assert_eq!(saved.len(), 1);
    assert_eq!(saved[0].input, Some(0));
    assert_eq!(saved[0].cache_read, None);
    assert_eq!(saved[0].output, Some(9));
    assert_eq!(saved[0].reported_at_ms, Some(1000));
    assert!(store.session_consumption(43).unwrap().is_empty());
}

#[test]
fn invalid_snapshot_preserves_saved_usage() {
    let store = Store::open(std::path::Path::new(":memory:")).unwrap();
    let mut record = snapshot();
    store.save_consumption(1, &record).unwrap();
    record.input = Some(u64::MAX);
    assert!(store.save_consumption(1, &record).is_err());
    assert_eq!(store.session_consumption(1).unwrap(), vec![snapshot()]);
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
fn database_failure_preserves_previous_snapshot_for_retry() {
    let store = Store::open(std::path::Path::new(":memory:")).unwrap();
    let mut record = snapshot();
    store.save_consumption(1, &record).unwrap();
    store
        .conn
        .execute_batch(
            "CREATE TRIGGER reject_consumption BEFORE UPDATE ON native_consumption_v1
         BEGIN SELECT RAISE(ABORT, 'fixture write failure'); END;",
        )
        .unwrap();
    record.output = Some(99);
    let error = store.save_consumption(1, &record).unwrap_err();
    assert!(error.contains("session=1"));
    assert!(error.contains("fixture write failure"));
    assert_eq!(store.session_consumption(1).unwrap(), vec![snapshot()]);
    store
        .conn
        .execute_batch("DROP TRIGGER reject_consumption")
        .unwrap();
    store.save_consumption(1, &record).unwrap();
    assert_eq!(store.session_consumption(1).unwrap(), vec![record]);
}

#[test]
fn shared_database_uses_persisted_session_identity() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("desktop.db");
    let store = Store::open_desktop(&path).unwrap();
    let session = store.create("codex", "/fixture").unwrap();
    let identity = store.persisted_session_id(session.id).unwrap();
    store.save_consumption(session.id, &snapshot()).unwrap();
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
        vec![snapshot()]
    );
}
