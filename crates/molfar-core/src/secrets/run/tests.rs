use super::*;
use crate::secrets::{SecretName, SecretValue};
use serde_json::json;
use std::path::Path;

#[test]
fn run_cwd_excludes_parent_and_symlink() {
    let root = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    let roots = vec![root.path().to_path_buf()];
    assert!(validate::cwd(None, &roots).is_ok());
    assert!(validate::cwd(Some(Path::new("..")), &roots).is_err());

    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(outside.path(), root.path().join("escape")).unwrap();
        assert!(validate::cwd(Some(Path::new("escape")), &roots).is_err());
    }
    assert!(validate::cwd(Some(outside.path()), &roots).is_err());
}

#[test]
fn run_rejects_invalid_env_and_missing_secret() {
    let dir = tempfile::tempdir().unwrap();
    let store = SecretStore::new(crate::secrets::backend::MemoryBackend::default());
    let db = Store::open(Path::new(":memory:")).unwrap();
    let roots = vec![dir.path().to_path_buf()];
    let input = |env| json!({"argv":["invalid-executable"],"secrets":[{"name":"TOKEN","env":env}]});
    assert!(Request::parse(&input("MOLFAR_APP_TOKEN")).is_err());
    assert!(Request::parse(&input("LD_PRELOAD")).is_err());
    let result = prepare(
        &store,
        &db,
        None,
        &roots,
        Request::parse(&input("TOKEN")).unwrap(),
    );
    assert_eq!(result.err().unwrap(), "Secret TOKEN unavailable.");
}

#[test]
fn run_injects_child_only_and_redacts_output() {
    let dir = tempfile::tempdir().unwrap();
    let store = SecretStore::new(crate::secrets::backend::MemoryBackend::default());
    let db = Store::open(Path::new(":memory:")).unwrap();
    store
        .create(
            &db,
            Scope::Global,
            SecretName::parse("TOKEN").unwrap(),
            SecretValue::from_text("fixture-secret-479".into()).unwrap(),
        )
        .unwrap();

    #[cfg(unix)]
    let argv = [
        "sh",
        "-c",
        "test -z \"$MOLFAR_APP_TOKEN\" && printf %s \"$MOLFAR_TEST_INJECTED_DELETEME\"",
    ];
    #[cfg(windows)]
    let argv = [
        "cmd.exe",
        "/D",
        "/C",
        "if not defined MOLFAR_APP_TOKEN echo %MOLFAR_TEST_INJECTED_DELETEME%",
    ];
    // Use an allowed destination name. The MOLFAR_ prefix is reserved.
    let argv = argv.map(|arg| arg.replace("MOLFAR_TEST_INJECTED_DELETEME", "TEST_INJECTED_479"));
    let request = Request::parse(
        &json!({"argv":argv,"secrets":[{"name":"TOKEN","env":"TEST_INJECTED_479"}]}),
    )
    .unwrap();
    let outcome = prepare(&store, &db, None, &[dir.path().into()], request)
        .unwrap()
        .execute(&Cancellation::default())
        .unwrap();
    assert_eq!(outcome.exit_code, Some(0));
    assert_eq!(outcome.stdout.trim(), "[secret:TOKEN]");
    assert!(std::env::var_os("TEST_INJECTED_479").is_none());
    assert!(!outcome.receipt().to_string().contains("stdout"));
}

#[test]
fn run_timeout_kills_process_group() {
    let dir = tempfile::tempdir().unwrap();
    let store = SecretStore::new(crate::secrets::backend::MemoryBackend::default());
    let db = Store::open(Path::new(":memory:")).unwrap();
    #[cfg(unix)]
    let argv = ["sh", "-c", "sleep 30 & wait"];
    #[cfg(windows)]
    let argv = ["cmd.exe", "/D", "/C", "ping -n 30 127.0.0.1 >NUL"];
    let request = Request::parse(&json!({"argv":argv,"timeoutSecs":1})).unwrap();
    let start = std::time::Instant::now();
    let outcome = prepare(&store, &db, None, &[dir.path().into()], request)
        .unwrap()
        .execute(&Cancellation::default())
        .unwrap();
    assert!(outcome.timed_out);
    assert!(
        !outcome.truncated,
        "Child pipes must close after terminating the tree"
    );
    assert!(start.elapsed().as_secs() < 10);
}

#[cfg(unix)]
#[test]
fn run_output_truncates_without_releasing_a_partial_secret() {
    let dir = tempfile::tempdir().unwrap();
    let store = SecretStore::new(crate::secrets::backend::MemoryBackend::default());
    let db = Store::open(Path::new(":memory:")).unwrap();
    store
        .create(
            &db,
            Scope::Global,
            SecretName::parse("TOKEN").unwrap(),
            SecretValue::from_text("fixture-run-truncation".into()).unwrap(),
        )
        .unwrap();
    let request = Request::parse(&json!({
        "argv":["sh","-c","head -c 262140 /dev/zero | tr '\\000' x; printf %s \"$TOKEN\""],
        "secrets":[{"name":"TOKEN","env":"TOKEN"}]
    }))
    .unwrap();
    let result = prepare(&store, &db, None, &[dir.path().into()], request)
        .unwrap()
        .execute(&Cancellation::default())
        .unwrap();
    assert!(result.truncated);
    assert_eq!(result.stdout.len(), OUTPUT_LIMIT - 4);
    assert!(result.stdout.bytes().all(|byte| byte == b'x'));
}

#[cfg(target_os = "macos")]
#[test]
fn run_cwd_accepts_the_private_tmp_alias() {
    let root = tempfile::tempdir_in("/tmp").unwrap();
    let absolute = root.path().canonicalize().unwrap();
    assert!(absolute.starts_with("/private/tmp"));
    assert_eq!(
        validate::cwd(Some(&absolute), &[root.path().to_path_buf()]).unwrap(),
        absolute
    );
}
