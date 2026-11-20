use super::*;
use crate::secrets::backend::{Backend, MemoryBackend};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};

#[test]
fn worktree_uses_main_project_id() {
    fn git(path: &Path, arguments: &[&str]) {
        let result = std::process::Command::new("git")
            .current_dir(path)
            .args(arguments)
            .output()
            .unwrap();
        assert!(
            result.status.success(),
            "{}",
            String::from_utf8_lossy(&result.stderr)
        );
    }

    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("project");
    std::fs::create_dir(&root).unwrap();
    git(&root, &["init"]);
    git(
        &root,
        &[
            "-c",
            "user.email=fixture@example.invalid",
            "-c",
            "user.name=Fixture",
            "-c",
            "commit.gpgsign=false",
            "commit",
            "--allow-empty",
            "-m",
            "fixture",
        ],
    );
    let worktree = temp.path().join("linked");
    git(
        &root,
        &["worktree", "add", "--detach", worktree.to_str().unwrap()],
    );

    let db = Store::open(Path::new(":memory:")).unwrap();
    let store = SecretStore::new(MemoryBackend::default());
    let root = store.project_scope(&db, &root, Some("Project")).unwrap();
    let linked = store
        .project_scope(&db, &worktree, Some("Project"))
        .unwrap();
    assert_eq!(root, linked);
}

#[test]
fn concurrent_create_keeps_one_entry() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("secrets.sqlite");
    let first = Store::open(&path).unwrap();
    let second = Store::open(&path).unwrap();
    let store = SecretStore::new(MemoryBackend::default());
    let barrier = Arc::new(std::sync::Barrier::new(2));
    let workers = [first, second].map(|db| {
        let store = store.clone();
        let barrier = barrier.clone();
        std::thread::spawn(move || {
            barrier.wait();
            store
                .create(
                    &db,
                    Scope::Global,
                    SecretName::parse("KEY").unwrap(),
                    SecretValue::from_text("fixture-value".into()).unwrap(),
                )
                .unwrap()
        })
    });

    let results = workers.map(|thread| thread.join().unwrap());
    assert!(results.contains(&Status::Exists));
    assert!(results.contains(&Status::Saved));
    let database = Store::open(&path).unwrap();
    assert_eq!(store.list(&database).unwrap().len(), 1);
}

#[derive(Clone, Default)]
struct FailingBackend {
    memory: Arc<MemoryBackend>,
    refuse_delete: Arc<AtomicBool>,
    refuse_read: Arc<AtomicBool>,
    last_account: Arc<std::sync::Mutex<String>>,
}

impl Backend for FailingBackend {
    fn probe(&self) -> Result<(), Error> {
        Ok(())
    }

    fn set(&self, account: &str, value: &SecretValue) -> Result<(), Error> {
        *self.last_account.lock().unwrap() = account.to_owned();
        self.memory.set(account, value)
    }

    fn get(&self, account: &str) -> Result<SecretValue, Error> {
        if self.refuse_read.load(Ordering::Relaxed) {
            return Err(Error::Unavailable);
        }
        self.memory.get(account)
    }

    fn delete(&self, account: &str) -> Result<(), Error> {
        if self.refuse_delete.load(Ordering::Relaxed) {
            return Err(Error::Unavailable);
        }
        self.memory.delete(account)
    }
}

#[test]
fn failed_delete_retains_metadata_for_retry() {
    let db = Store::open(Path::new(":memory:")).unwrap();
    let backend = FailingBackend::default();
    let store = SecretStore::new(backend.clone());
    let scope = Scope::Project("project".into());
    store
        .create(
            &db,
            scope.clone(),
            SecretName::parse("KEY").unwrap(),
            SecretValue::from_text("fixture-value".into()).unwrap(),
        )
        .unwrap();
    backend.refuse_delete.store(true, Ordering::Relaxed);
    assert_eq!(store.delete_scope(&db, &scope), Err(Error::Unavailable));
    let failed = store.list(&db).unwrap().remove(0);
    assert!(failed.delete_failed);

    backend.refuse_delete.store(false, Ordering::Relaxed);
    store.delete(&db, &failed.id).unwrap();
    assert!(store.list(&db).unwrap().is_empty());
}

#[test]
fn index_write_failure_rolls_back_os_credential() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("secrets.sqlite");
    let db = Store::open(&path).unwrap();
    let backend = FailingBackend::default();
    let store = SecretStore::new(backend.clone());
    let fixture = rusqlite::Connection::open(&path).unwrap();
    fixture.execute_batch("CREATE TRIGGER reject_secret_index BEFORE INSERT ON native_settings WHEN NEW.key = 'secrets.index' BEGIN SELECT RAISE(ABORT, 'Fixture rejects index mutation'); END;").unwrap();
    assert_eq!(
        store.create(
            &db,
            Scope::Global,
            SecretName::parse("KEY").unwrap(),
            SecretValue::from_text("fixture-value".into()).unwrap()
        ),
        Err(Error::Index)
    );
    let account = backend.last_account.lock().unwrap();
    assert!(!account.is_empty());
    assert!(matches!(backend.get(&account), Err(Error::Missing)));
    assert!(store.list(&db).unwrap().is_empty());
}

#[test]
fn external_catalog_has_no_secret_tools() {
    assert!(crate::external_mcp::tools::catalog()
        .iter()
        .all(|tool| !tool.name.starts_with("secrets") && tool.name != "run"));
}

#[test]
fn stale_keyring_entry_does_not_disable_redaction_of_other_values() {
    let db = Store::open(Path::new(":memory:")).unwrap();
    let backend = FailingBackend::default();
    let store = SecretStore::new(backend.clone());
    for (name, value) in [("STALE", "stale-value"), ("PRESENT", "present-value")] {
        store
            .create(
                &db,
                Scope::Global,
                SecretName::parse(name).unwrap(),
                SecretValue::from_text(value.into()).unwrap(),
            )
            .unwrap();
    }

    let stale = store.list(&db).unwrap().remove(0);
    backend.delete(&stale.account()).unwrap();
    let reopened = SecretStore::new(backend.clone());
    let redactor = reopened.redactor(&db, None).unwrap();
    assert_eq!(redactor.text("present-value"), "[secret:PRESENT]");
    assert_eq!(redactor.text("stale-value"), "stale-value");

    backend.refuse_read.store(true, Ordering::Relaxed);
    let reopened = SecretStore::new(backend);
    assert!(matches!(
        reopened.redactor(&db, None),
        Err(Error::Unavailable)
    ));
}

#[test]
fn familiar_scope_is_isolated_and_deletable() {
    let db = Store::open(Path::new(":memory:")).unwrap();
    let store = SecretStore::new(MemoryBackend::default());
    let familiar = Scope::Familiar("id".into());
    let project = Scope::Project("id".into());
    for (scope, value) in [
        (familiar.clone(), "familiar-fixture"),
        (project.clone(), "project-fixture"),
        (Scope::Global, "global-fixture"),
    ] {
        store
            .create(
                &db,
                scope,
                SecretName::parse("TOKEN").unwrap(),
                SecretValue::from_text(value.into()).unwrap(),
            )
            .unwrap();
    }

    let entries = store.list(&db).unwrap();
    let entry = entries
        .iter()
        .find(|entry| entry.scope == familiar)
        .unwrap();
    assert_eq!(entry.account(), format!("familiar:id/{}", entry.id));
    let encoded = serde_json::to_string(entry).unwrap();
    assert_eq!(*entry, serde_json::from_str::<Entry>(&encoded).unwrap());

    let redact = store.redactor(&db, Some(familiar.clone())).unwrap();
    assert_eq!(
        redact.text("familiar-fixture project-fixture global-fixture"),
        "[secret:TOKEN] project-fixture [secret:TOKEN]"
    );
    store.delete_scope(&db, &familiar).unwrap();
    assert!(store
        .list(&db)
        .unwrap()
        .iter()
        .all(|entry| entry.scope != familiar));
    assert_eq!(
        redact.text("familiar-fixture global-fixture"),
        "familiar-fixture [secret:TOKEN]"
    );
}

#[test]
fn familiar_list_and_run_cannot_resolve_project_credentials() {
    let db = Store::open(Path::new(":memory:")).unwrap();
    let store = SecretStore::new(MemoryBackend::default());
    let scope = Scope::Familiar("own".into());
    let name = SecretName::parse("PROJECT_ONLY").unwrap();
    store
        .create(
            &db,
            Scope::Project("p".into()),
            name.clone(),
            SecretValue::from_text("project-only-fixture".into()).unwrap(),
        )
        .unwrap();
    assert_eq!(
        request::list(&store, &db, Some(scope.clone())).unwrap(),
        serde_json::json!([])
    );
    let scopes = scopes_for(Some(scope.clone())).collect::<Vec<_>>();
    assert_eq!(
        store
            .resolve_names(&db, &scopes, std::slice::from_ref(&name))
            .err()
            .unwrap(),
        "Secret PROJECT_ONLY unavailable."
    );
    let mut request = request::SecretRequest {
        request_id: "fixture".into(),
        session: 42,
        agent: "Fixture".into(),
        name,
        scope: scope.clone(),
        reason: "Need credential".into(),
        status: request::RequestStatus::Open,
        time: 1,
    }
    .prepare(&store, &db)
    .unwrap()
    .unwrap();
    request.status = request::RequestStatus::Saved;
    store
        .create(
            &db,
            request.scope,
            request.name,
            SecretValue::from_text("familiar-only-fixture".into()).unwrap(),
        )
        .unwrap();
    assert_eq!(
        super::request::list(&store, &db, Some(scope)).unwrap()[0]["scope"],
        "familiar:own"
    );
}
