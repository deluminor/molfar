use super::*;

#[test]
fn confluence_migration_is_idempotent_and_only_stores_token_in_keyring() {
    let root = tempfile::tempdir().unwrap();
    let source = root.path().join("jira-config.json");
    let legacy = r#"{"site":"EXAMPLE.atlassian.net/wiki","email":"reader@example.invalid","token":"fixture-legacy-value"}"#;
    fs::write(&source, legacy).unwrap();
    let db = Store::open(&root.path().join("native.sqlite")).unwrap();
    let secrets = SecretStore::in_memory();

    migrate(&db, &secrets).unwrap();
    assert_eq!(
        db.setting(CONNECTION).unwrap().unwrap(),
        r#"{"site":"https://example.atlassian.net","email":"reader@example.invalid"}"#
    );
    assert_eq!(fs::read_to_string(&source).unwrap(), legacy);
    let entry = token_entry(&db, &secrets).unwrap().unwrap();
    assert_eq!(
        secrets.read_value(&entry).unwrap().expose_secret(),
        "fixture-legacy-value"
    );

    fs::write(&source, "{}").unwrap();
    migrate(&db, &secrets).unwrap();
    assert_eq!(token_entry(&db, &secrets).unwrap().unwrap(), entry);
    disconnect(&db, &secrets).unwrap();
    migrate(&db, &secrets).unwrap();
    assert!(load(&db).unwrap().is_none());
    assert!(token_entry(&db, &secrets).unwrap().is_none());
}

#[test]
fn confluence_refuses_tokens_outside_the_keyring_limit_before_storage() {
    assert!(SecretValue::from_text("short".into()).is_err());
    assert!(SecretValue::from_text("x".repeat(1025)).is_err());
    let root = tempfile::tempdir().unwrap();
    let db = Store::open(&root.path().join("native.sqlite")).unwrap();
    let secrets = SecretStore::in_memory();
    let connection = Connection::parse("example.atlassian.net", "reader@example.invalid").unwrap();
    connect(
        &db,
        &secrets,
        &connection,
        SecretValue::from_text("x".repeat(8)).unwrap(),
    )
    .unwrap();
    let stored = db.setting(CONNECTION).unwrap().unwrap();
    assert!(!stored.contains("xxxxxxxx"));
    assert!(!stored.to_ascii_lowercase().contains("authorization"));
}
