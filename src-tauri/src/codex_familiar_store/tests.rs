use super::*;

struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let dir = std::env::temp_dir().join(format!("molfar-codex-store-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        Self(dir)
    }
    fn source(&self) -> PathBuf {
        self.0.join("account")
    }
    fn home(&self) -> PathBuf {
        self.0.join("familiar")
    }
    fn rollout(&self, id: &str, base: Option<&str>) -> PathBuf {
        let dir = self.source().join("archived_sessions");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(format!("rollout-2026-10-08T10-00-00-{id}.jsonl"));
        let meta = serde_json::json!({"type":"session_meta", "payload": {"id":id, "history_base":base.map(|id| serde_json::json!({"thread_id":id}))}});
        std::fs::write(&path, format!("{meta}\n{{\"type\":\"response_item\",\"payload\":{{\"tool_history\":\"retained\"}}}}\n")).unwrap();
        path
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

#[test]
fn shares_settings_and_login_but_not_codex_state() {
    let fixture = Fixture::new();
    let source = fixture.source();
    let home = fixture.home();
    std::fs::create_dir_all(source.join("sessions")).unwrap();
    for name in [
        "config.toml",
        "auth.json",
        "history.jsonl",
        "state_5.sqlite",
        "session_index.jsonl",
    ] {
        std::fs::write(source.join(name), name).unwrap();
    }
    std::fs::create_dir_all(source.join("skills")).unwrap();
    prepare_files(&source, &home).unwrap();
    prepare_files(&source, &home).unwrap();
    assert_eq!(
        std::fs::read_to_string(home.join("config.toml")).unwrap(),
        "config.toml"
    );
    std::fs::write(home.join("auth.json"), "refreshed login").unwrap();
    assert_eq!(
        std::fs::read_to_string(source.join("auth.json")).unwrap(),
        "refreshed login"
    );
    assert!(home.join("skills").is_dir());
    assert!(home.join("sessions").is_dir());
    for name in ["history.jsonl", "state_5.sqlite", "session_index.jsonl"] {
        assert!(!home.join(name).exists());
    }
    std::fs::write(home.join("sessions/private"), "private").unwrap();
    assert!(!source.join("sessions/private").exists());
    std::fs::write(home.join("secrets/shared"), "encrypted").unwrap();
    assert_eq!(
        std::fs::read_to_string(source.join("secrets/shared")).unwrap(),
        "encrypted"
    );
}

#[test]
fn does_not_fight_the_codex_subprocess_over_the_session_index_lock() {
    let fixture = Fixture::new();
    let source = fixture.source();
    let home = fixture.home();
    std::fs::create_dir_all(source.join("sessions")).unwrap();
    // The real codex CLI writes its own lock locally in each home it's
    // pointed at, independently of this sync.
    std::fs::write(source.join("session_index.jsonl.lock"), "account").unwrap();
    std::fs::create_dir_all(&home).unwrap();
    std::fs::write(home.join("session_index.jsonl.lock"), "familiar").unwrap();
    prepare_files(&source, &home).unwrap();
    assert!(
        std::fs::symlink_metadata(home.join("session_index.jsonl.lock"))
            .unwrap()
            .file_type()
            .is_file(),
        "the familiar's own lock must stay a private local file, not get linked to the account home's"
    );
    // A hard link would also report is_file(), so prove independence by
    // content: writing to the account's lock must not reach the familiar's.
    std::fs::write(source.join("session_index.jsonl.lock"), "account changed").unwrap();
    assert_eq!(
        std::fs::read_to_string(home.join("session_index.jsonl.lock")).unwrap(),
        "familiar"
    );
}

// Windows file sharing uses hard links, not symlinks (see link_entry),
// so the two platforms need separate reproductions of the stale state.
#[cfg(unix)]
#[test]
fn drops_a_stale_lock_link_from_before_the_lock_became_private() {
    let fixture = Fixture::new();
    let source = fixture.source();
    let home = fixture.home();
    std::fs::create_dir_all(source.join("sessions")).unwrap();
    std::fs::write(source.join("session_index.jsonl.lock"), "account").unwrap();
    std::fs::create_dir_all(&home).unwrap();
    // A familiar provisioned before the lock became private can still have
    // this symlink left over from an earlier sync.
    std::os::unix::fs::symlink(
        source.join("session_index.jsonl.lock"),
        home.join("session_index.jsonl.lock"),
    )
    .unwrap();
    prepare_files(&source, &home).unwrap();
    assert!(
        !home.join("session_index.jsonl.lock").exists(),
        "the stale link must be removed, leaving the familiar's own writer to recreate a private lock"
    );
    assert_eq!(
        std::fs::read_to_string(source.join("session_index.jsonl.lock")).unwrap(),
        "account",
        "removing the link must not touch its target"
    );
}

#[cfg(unix)]
#[test]
fn concurrent_preparations_all_survive_a_stale_lock_link() {
    for _ in 0..50 {
        let fixture = Fixture::new();
        let source = fixture.source();
        let home = fixture.home();
        std::fs::create_dir_all(source.join("sessions")).unwrap();
        std::fs::write(source.join("session_index.jsonl.lock"), "account").unwrap();
        std::fs::create_dir_all(&home).unwrap();
        std::os::unix::fs::symlink(
            source.join("session_index.jsonl.lock"),
            home.join("session_index.jsonl.lock"),
        )
        .unwrap();
        let start = std::sync::Barrier::new(8);
        std::thread::scope(|scope| {
            let workers: Vec<_> = (0..8)
                .map(|_| {
                    scope.spawn(|| {
                        start.wait();
                        prepare_files(&source, &home)
                    })
                })
                .collect();
            for worker in workers {
                worker.join().unwrap().unwrap();
            }
        });
        assert!(!home.join("session_index.jsonl.lock").exists());
    }
}

#[cfg(windows)]
#[test]
fn drops_a_stale_lock_hard_link_from_before_the_lock_became_private() {
    let fixture = Fixture::new();
    let source = fixture.source();
    let home = fixture.home();
    std::fs::create_dir_all(source.join("sessions")).unwrap();
    std::fs::write(source.join("session_index.jsonl.lock"), "account").unwrap();
    std::fs::create_dir_all(&home).unwrap();
    // A familiar provisioned before the lock became private can still have
    // this hard link left over from an earlier sync (link_entry shares
    // files via hard_link on Windows, not a symlink).
    std::fs::hard_link(
        source.join("session_index.jsonl.lock"),
        home.join("session_index.jsonl.lock"),
    )
    .unwrap();
    prepare_files(&source, &home).unwrap();
    assert!(
        !home.join("session_index.jsonl.lock").exists(),
        "the stale hard link must be removed, leaving the familiar's own writer to recreate a private lock"
    );
    assert_eq!(
        std::fs::read_to_string(source.join("session_index.jsonl.lock")).unwrap(),
        "account",
        "removing the hard link must not touch its target"
    );
}

#[cfg(windows)]
#[test]
fn does_not_remove_an_unrelated_lock_with_the_same_name() {
    let fixture = Fixture::new();
    let source = fixture.source();
    let home = fixture.home();
    std::fs::create_dir_all(source.join("sessions")).unwrap();
    std::fs::write(source.join("session_index.jsonl.lock"), "account").unwrap();
    std::fs::create_dir_all(&home).unwrap();
    // Not a link to the account's lock, just a file that happens to
    // share its name and content — must be left alone.
    std::fs::write(home.join("session_index.jsonl.lock"), "account").unwrap();
    prepare_files(&source, &home).unwrap();
    assert_eq!(
        std::fs::read_to_string(home.join("session_index.jsonl.lock")).unwrap(),
        "account",
        "an unrelated file must survive, only a genuine link to the source should be removed"
    );
}

#[test]
fn rejects_a_private_state_link_to_the_original_home() {
    let fixture = Fixture::new();
    std::fs::create_dir_all(fixture.source().join("sessions")).unwrap();
    std::fs::create_dir_all(fixture.home()).unwrap();
    #[cfg(unix)]
    std::os::unix::fs::symlink(
        fixture.source().join("sessions"),
        fixture.home().join("sessions"),
    )
    .unwrap();
    #[cfg(windows)]
    junction::create(
        fixture.source().join("sessions"),
        fixture.home().join("sessions"),
    )
    .unwrap();
    assert!(prepare_files(&fixture.source(), &fixture.home()).is_err());
}

#[cfg(windows)]
#[test]
fn shares_readable_directory_junctions_with_verbatim_paths() {
    let fixture = Fixture::new();
    let source = fixture.source().join("skills [shared]");
    std::fs::create_dir_all(&source).unwrap();
    std::fs::create_dir_all(fixture.home()).unwrap();
    std::fs::write(source.join("skill.txt"), "shared skill").unwrap();
    // canonicalize supplies the verbatim prefix that broke PowerShell.
    let source = source.canonicalize().unwrap();
    let target = fixture.home().canonicalize().unwrap().join("skills");
    link_entry(&source, &target).unwrap();
    assert_eq!(
        std::fs::read_to_string(target.join("skill.txt")).unwrap(),
        "shared skill"
    );
    link_entry(&source, &target).unwrap();
    assert_eq!(target.canonicalize().unwrap(), source);
}

#[cfg(windows)]
#[test]
fn rejects_an_unrelated_configuration_junction() {
    let fixture = Fixture::new();
    let source = fixture.source();
    let other = fixture.0.join("other-account");
    let target = fixture.home().join("skills");
    std::fs::create_dir_all(&source).unwrap();
    std::fs::create_dir_all(&other).unwrap();
    std::fs::create_dir_all(fixture.home()).unwrap();
    junction::create(&other, &target).unwrap();
    assert!(link_entry(&source.canonicalize().unwrap(), &target).is_err());
    assert_eq!(
        target.canonicalize().unwrap(),
        other.canonicalize().unwrap()
    );
}

#[test]
fn retains_native_bytes_descendants_compressed_tails_and_inherited_history() {
    let fixture = Fixture::new();
    let base = fixture.rollout("base-id", None);
    let root = fixture.rollout("root-id", Some("base-id"));
    let child = fixture.rollout("child-id", Some("root-id"));
    let child_bytes = std::fs::read(&child).unwrap();
    let compressed = child.with_extension("jsonl.zst");
    std::fs::write(
        &compressed,
        zstd::stream::encode_all(child_bytes.as_slice(), 0).unwrap(),
    )
    .unwrap();
    std::fs::write(
        &child,
        "{\"type\":\"event_msg\",\"payload\":{\"after_compression\":true}}\n",
    )
    .unwrap();
    prepare_files(&fixture.source(), &fixture.home()).unwrap();
    copy_rollouts(
        &fixture.source(),
        &fixture.home(),
        "root-id",
        &[root.clone(), compressed.clone()],
    )
    .unwrap();
    for path in [&root, &base, &child, &compressed] {
        let target = fixture
            .home()
            .join("sessions/2026/10/08")
            .join(path.file_name().unwrap());
        assert_eq!(std::fs::read(path).unwrap(), std::fs::read(target).unwrap());
    }
    assert!(contains_thread(&fixture.home().join("sessions"), "root-id").unwrap());
    assert!(!fixture.home().join(".molfar-migrations/root-id").exists());
    // A retry is safe and leaves source files intact.
    copy_rollouts(
        &fixture.source(),
        &fixture.home(),
        "root-id",
        &[root, child],
    )
    .unwrap();
}

#[test]
fn rejects_unrelated_files_and_missing_inherited_context() {
    let fixture = Fixture::new();
    let root = fixture.rollout("root-id", Some("missing-id"));
    prepare_files(&fixture.source(), &fixture.home()).unwrap();
    assert!(copy_rollouts(&fixture.source(), &fixture.home(), "root-id", &[root]).is_err());
    assert!(!contains_thread(&fixture.home().join("sessions"), "root-id").unwrap());
    let outside = fixture.0.join("rollout-2026-10-08T10-00-00-root-id.jsonl");
    std::fs::write(&outside, "{}\n").unwrap();
    assert!(copy_rollouts(&fixture.source(), &fixture.home(), "root-id", &[outside]).is_err());
    assert!(validate_thread_id("../other").is_err());
}

#[test]
fn refreshed_keyring_credentials_only_recover_the_same_account() {
    let auth = |account: &str, at: &str| {
        Some(serde_json::json!({"tokens":{"account_id":account}, "last_refresh":at}).to_string())
    };
    assert!(newer_same_account(
        &auth("one", "2026-10-08T12:00:00Z"),
        &auth("one", "2026-10-08T11:00:00Z")
    ));
    assert!(!newer_same_account(
        &auth("one", "2026-10-08T11:00:00Z"),
        &auth("one", "2026-10-08T12:00:00Z")
    ));
    assert!(!newer_same_account(
        &auth("two", "2026-10-08T12:00:00Z"),
        &auth("one", "2026-10-08T11:00:00Z")
    ));
    assert!(!newer_same_account(
        &auth("one", "2026-10-08T12:00:00Z"),
        &None
    ));
}

#[test]
fn migration_keeps_closed_agents_closed_and_leaves_other_threads_out() {
    let fixture = Fixture::new();
    let root = fixture.rollout("root", None);
    let child = fixture.rollout("closed-child", Some("root"));
    let db = rusqlite::Connection::open(fixture.source().join("state_5.sqlite")).unwrap();
    db.execute_batch("CREATE TABLE thread_spawn_edges(parent_thread_id TEXT NOT NULL, child_thread_id TEXT PRIMARY KEY, status TEXT NOT NULL); INSERT INTO thread_spawn_edges VALUES ('root','open-child','open'), ('root','closed-child','closed'), ('other','unrelated','closed');").unwrap();
    let edges = closed_agent_edges(&fixture.source(), "root").unwrap();
    assert_eq!(edges.len(), 1);
    assert_eq!(edges[0].child, "closed-child");
    prepare_files(&fixture.source(), &fixture.home()).unwrap();
    copy_rollouts_with_edges(
        &fixture.source(),
        &fixture.home(),
        "root",
        &[root, child],
        &edges,
    )
    .unwrap();
    // app-server creates this schema during initialization. It can backfill
    // an open edge before or after the saved closure is restored.
    let private = rusqlite::Connection::open(fixture.home().join("state_5.sqlite")).unwrap();
    private.execute_batch("CREATE TABLE thread_spawn_edges(parent_thread_id TEXT NOT NULL, child_thread_id TEXT PRIMARY KEY, status TEXT NOT NULL); INSERT INTO thread_spawn_edges VALUES ('root','closed-child','open');").unwrap();
    restore_agent_edges(&fixture.home(), "root").unwrap();
    let status: String = private
        .query_row(
            "SELECT status FROM thread_spawn_edges WHERE child_thread_id='closed-child'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(status, "closed");
    let count: i64 = private
        .query_row("SELECT count(*) FROM thread_spawn_edges", [], |row| {
            row.get(0)
        })
        .unwrap();
    assert_eq!(count, 1);
    assert!(!edge_snapshot_path(&fixture.home(), "root").exists());
    // Later changes in the private graph must not be overwritten on resume.
    private
        .execute("UPDATE thread_spawn_edges SET status='open'", [])
        .unwrap();
    restore_agent_edges(&fixture.home(), "root").unwrap();
    let status: String = private
        .query_row("SELECT status FROM thread_spawn_edges", [], |row| {
            row.get(0)
        })
        .unwrap();
    assert_eq!(status, "open");
}

#[test]
fn keeps_ephemeral_lock_files_private() {
    let fixture = Fixture::new();
    let source = fixture.source();
    let home = fixture.home();
    std::fs::create_dir_all(&source).unwrap();
    std::fs::create_dir_all(&home).unwrap();
    std::fs::write(source.join("config.toml"), "config").unwrap();
    std::fs::write(source.join("memories.lock"), "").unwrap();
    std::fs::write(source.join(".sqlite-maintenance.lock"), "").unwrap();
    // Familiar Codex previously created its own lock in the private home.
    std::fs::write(home.join("memories.lock"), "").unwrap();
    prepare_files(&source, &home).unwrap();
    prepare_files(&source, &home).unwrap();
    assert!(home.join("memories.lock").is_file());
    assert!(std::fs::symlink_metadata(home.join("memories.lock"))
        .unwrap()
        .file_type()
        .is_file());
    assert!(!home.join(".sqlite-maintenance.lock").exists());
    assert_eq!(
        std::fs::read_to_string(home.join("config.toml")).unwrap(),
        "config"
    );
}
