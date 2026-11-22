use super::*;

fn fixture() -> (Store, SecretStore) {
    assert_eq!(std::env::var("MOLFAR_REAL_KEYRING").as_deref(), Ok("1"));
    let path = std::env::var_os("MOLFAR_KEYRING_TEST_DB").expect("set a temporary database path");
    (
        Store::open(Path::new(&path)).unwrap(),
        SecretStore::keyring(),
    )
}

fn max_value() -> String {
    "a".repeat(MAX_VALUE_BYTES)
}

#[test]
#[ignore = "requires a real OS credential store and a temporary database"]
fn real_backend_write() {
    let (database, store) = fixture();
    store.probe().unwrap();
    assert_eq!(
        store.create(
            &database,
            Scope::Global,
            SecretName::parse("BACKEND_TEST").unwrap(),
            SecretValue::from_text(max_value()).unwrap()
        ),
        Ok(Status::Saved)
    );
    assert!(!database
        .setting(INDEX)
        .unwrap()
        .unwrap()
        .contains(&max_value()));
}

#[test]
#[ignore = "run real_backend_write in an earlier process"]
fn real_backend_read_and_delete() {
    let (database, store) = fixture();
    let result = store.redactor(&database, None).unwrap().text(&max_value());
    store.delete_scope(&database, &Scope::Global).unwrap();
    assert_eq!(result, "[secret:BACKEND_TEST]");
    assert!(store.list(&database).unwrap().is_empty());
}

#[cfg(target_os = "linux")]
#[test]
#[ignore = "run without a working D-Bus Secret Service"]
fn real_backend_unavailable() {
    let (database, store) = fixture();
    let value = max_value();
    assert_eq!(store.probe(), Err(Error::Unavailable));
    assert_eq!(
        store.create(
            &database,
            Scope::Global,
            SecretName::parse("BACKEND_TEST").unwrap(),
            SecretValue::from_text(value.clone()).unwrap()
        ),
        Err(Error::Unavailable)
    );
    assert!(store.list(&database).unwrap().is_empty());
    let dir = database.database_path().parent().unwrap();
    assert!(std::fs::read_dir(dir).unwrap().all(|file| {
        let bytes = std::fs::read(file.unwrap().path()).unwrap();
        !bytes
            .windows(MAX_VALUE_BYTES)
            .any(|window| window == value.as_bytes())
    }));
}
