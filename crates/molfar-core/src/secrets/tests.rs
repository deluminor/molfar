use super::*;

#[test]
fn create_keeps_existing_value_and_serializes_only_metadata() {
    let database = Store::open(Path::new(":memory:")).unwrap();
    let store = SecretStore::new(backend::MemoryBackend::default());
    let name = SecretName::parse("API_KEY").unwrap();
    let value = || SecretValue::parse("sample-credential".into()).unwrap();

    assert_eq!(
        store.create(&database, Scope::Global, name.clone(), value()),
        Ok(Status::Saved)
    );
    assert_eq!(
        store.create(&database, Scope::Global, name, value()),
        Ok(Status::Exists)
    );
    let index = database.setting(INDEX).unwrap().unwrap();
    assert!(!index.contains("sample-credential"));
    assert_eq!(store.list(&database).unwrap().len(), 1);
}

#[test]
fn validates_name_and_normalizes_one_trailing_newline() {
    assert!(SecretName::parse("name").is_err());
    assert!(SecretName::parse("A".repeat(65)).is_err());
    assert!(SecretValue::parse("1234567\n".into()).is_err());
    assert!(SecretValue::parse("12345678\n".into()).is_ok());
    assert!(SecretValue::parse("a".repeat(1025).into()).is_err());
}

#[test]
fn project_scope_survives_label_changes_and_missing_folder() {
    let folder = tempfile::tempdir().unwrap();
    let database = Store::open(Path::new(":memory:")).unwrap();
    let store = SecretStore::new(backend::MemoryBackend::default());
    let path = folder.path().to_owned();

    let scope = store
        .project_scope(&database, &path, Some("First"))
        .unwrap();
    assert_eq!(
        store
            .project_scope(&database, &path, Some("Second"))
            .unwrap(),
        scope
    );
    folder.close().unwrap();
    let projects = store.projects(&database).unwrap();
    assert_eq!(projects[0].last_label, "Second");
    assert!(projects[0].is_missing());
}

#[test]
fn scoped_deletion_preserves_global_entry() {
    let database = Store::open(Path::new(":memory:")).unwrap();
    let store = SecretStore::new(backend::MemoryBackend::default());
    let project = Scope::Project("test-project".into());
    for scope in [Scope::Global, project.clone()] {
        store
            .create(
                &database,
                scope,
                SecretName::parse("API_KEY").unwrap(),
                SecretValue::parse("sample-credential".into()).unwrap(),
            )
            .unwrap();
    }

    store.delete_scope(&database, &project).unwrap();
    let remaining = store.list(&database).unwrap();
    assert_eq!(remaining.len(), 1);
    assert_eq!(remaining[0].scope, Scope::Global);
}

#[test]
fn redacts_stream_at_every_unicode_boundary_and_tracks_replaced_values() {
    let database = Store::open(Path::new(":memory:")).unwrap();
    let store = SecretStore::new(backend::MemoryBackend::default());
    let name = SecretName::parse("API_KEY").unwrap();
    let redactor = store.redactor(&database, None).unwrap();
    let value = "🔑sample-value";
    store
        .create(
            &database,
            Scope::Global,
            name,
            SecretValue::parse(value.into()).unwrap(),
        )
        .unwrap();

    let source = format!("prefix {value} suffix");
    for (offset, _) in source.char_indices() {
        let mut stream = super::redact::StreamRedactor::default();
        let mut result = stream.push(&redactor, &source[..offset]);
        result.push_str(&stream.push(&redactor, &source[offset..]));
        result.push_str(&stream.finish(&redactor));
        assert_eq!(result, "prefix [secret:API_KEY] suffix");
    }

    let entry = store.list(&database).unwrap().remove(0);
    let new_value = "longer-value\nanother-line";
    store
        .replace(
            &database,
            &entry.id,
            SecretValue::parse(new_value.into()).unwrap(),
        )
        .unwrap();
    store
        .rename(&database, &entry.id, SecretName::parse("RENAMED").unwrap())
        .unwrap();
    assert_eq!(
        redactor.text(&format!("{value} {new_value} another-line")),
        "[secret:RENAMED] [secret:RENAMED] [secret:RENAMED]"
    );
    store.delete(&database, &entry.id).unwrap();
    assert_eq!(redactor.text(value), value);
}

#[test]
fn default_store_is_shared_and_in_memory_in_tests() {
    let database = Store::open(Path::new(":memory:")).unwrap();
    let store = SecretStore::default();
    let value = "default-store-fixture-value";

    assert!(store.shares_backend(&SecretStore::default()));
    assert_eq!(store.probe(), Ok(()));
    assert_eq!(
        store.create(
            &database,
            Scope::Global,
            SecretName::parse("DEFAULT_STORE_FIXTURE").unwrap(),
            SecretValue::parse(value.into()).unwrap()
        ),
        Ok(Status::Saved)
    );
    assert_eq!(
        store.redactor(&database, None).unwrap().text(value),
        "[secret:DEFAULT_STORE_FIXTURE]"
    );
    store.delete_scope(&database, &Scope::Global).unwrap();
}

mod real_backend;
mod storage;
