use std::ffi::OsStr;
use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::Connection;

use super::legacy_process::is_legacy_process_name;
use super::*;

fn temp_base() -> PathBuf {
    let base = std::env::temp_dir().join(format!("vatra-identity-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&base).unwrap();
    base
}

fn write(path: &Path, body: &str) {
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, body).unwrap();
}

fn entries_starting_with(base: &Path, prefix: &str) -> Vec<String> {
    fs::read_dir(base)
        .unwrap()
        .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
        .filter(|name| name.starts_with(prefix))
        .collect()
}

#[test]
fn copies_legacy_tree_and_keeps_the_original() {
    let base = temp_base();
    write(&base.join("old/settings.json"), "{}");
    write(
        &base.join("old/WebsiteData/LocalStorage/origin"),
        "settings",
    );

    assert_eq!(
        migrate_base(&base, "old", "new").unwrap(),
        Outcome::Migrated
    );

    assert_eq!(
        fs::read_to_string(base.join("new/settings.json")).unwrap(),
        "{}"
    );
    assert_eq!(
        fs::read_to_string(base.join("new/WebsiteData/LocalStorage/origin")).unwrap(),
        "settings"
    );
    assert!(base.join("old/settings.json").exists());
    assert!(!base.join("new.migrating").exists());
    assert!(!pending_marker(&base, "new").exists());
    fs::remove_dir_all(base).unwrap();
}

#[test]
fn never_overwrites_a_completed_migration() {
    let base = temp_base();
    write(&base.join("old/settings.json"), "legacy");
    write(&base.join("new/settings.json"), "current");

    assert_eq!(migrate_base(&base, "old", "new").unwrap(), Outcome::Skipped);

    assert_eq!(
        fs::read_to_string(base.join("new/settings.json")).unwrap(),
        "current"
    );
    fs::remove_dir_all(base).unwrap();
}

#[test]
fn skips_when_there_is_nothing_to_migrate() {
    let base = temp_base();

    assert_eq!(migrate_base(&base, "old", "new").unwrap(), Outcome::Skipped);

    assert!(!base.join("new").exists());
    assert!(!pending_marker(&base, "new").exists());
    fs::remove_dir_all(base).unwrap();
}

#[test]
fn replaces_an_interrupted_staging_copy() {
    let base = temp_base();
    write(&base.join("old/settings.json"), "legacy");
    write(&base.join("new.migrating/partial"), "stale");

    assert_eq!(
        migrate_base(&base, "old", "new").unwrap(),
        Outcome::Migrated
    );

    assert!(!base.join("new/partial").exists());
    assert_eq!(
        fs::read_to_string(base.join("new/settings.json")).unwrap(),
        "legacy"
    );
    fs::remove_dir_all(base).unwrap();
}

#[test]
fn retries_a_failed_migration_and_backs_up_the_interim_profile() {
    let base = temp_base();
    write(&base.join("old/settings.json"), "legacy");
    write(&base.join("new/settings.json"), "interim");
    mark_pending(&base, "new").unwrap();

    assert_eq!(
        migrate_base(&base, "old", "new").unwrap(),
        Outcome::Migrated
    );

    assert_eq!(
        fs::read_to_string(base.join("new/settings.json")).unwrap(),
        "legacy"
    );
    let backups = entries_starting_with(&base, "new.before-migration-");
    assert_eq!(backups.len(), 1);
    assert_eq!(
        fs::read_to_string(base.join(&backups[0]).join("settings.json")).unwrap(),
        "interim"
    );
    assert!(!pending_marker(&base, "new").exists());
    fs::remove_dir_all(base).unwrap();
}

#[cfg(unix)]
#[test]
fn a_failed_copy_leaves_the_migration_pending() {
    use std::os::unix::fs::PermissionsExt;

    let base = temp_base();
    let unreadable = base.join("old/locked");
    write(&unreadable.join("file"), "data");
    fs::set_permissions(&unreadable, fs::Permissions::from_mode(0o000)).unwrap();
    // Root ignores permission bits, so the copy cannot be made to fail there.
    if fs::read_dir(&unreadable).is_ok() {
        fs::set_permissions(&unreadable, fs::Permissions::from_mode(0o700)).unwrap();
        fs::remove_dir_all(base).unwrap();
        return;
    }

    assert!(migrate_base(&base, "old", "new").is_err());

    assert!(!base.join("new").exists());
    assert!(pending_marker(&base, "new").exists());
    fs::create_dir_all(base.join("new")).unwrap();
    assert!(needs_migration(&base, "old", "new"));
    fs::set_permissions(&unreadable, fs::Permissions::from_mode(0o700)).unwrap();
    fs::remove_dir_all(base).unwrap();
}

#[test]
fn snapshots_the_session_database_without_raw_sidecars() {
    let base = temp_base();
    let legacy = base.join("old");
    fs::create_dir_all(&legacy).unwrap();
    let writer = Connection::open(legacy.join("monocode.db")).unwrap();
    writer
        .execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA wal_autocheckpoint = 0;
             CREATE TABLE sessions (id TEXT);
             INSERT INTO sessions VALUES ('in-wal');",
        )
        .unwrap();
    assert!(legacy.join("monocode.db-wal").exists());

    assert_eq!(
        migrate_base(&base, "old", "new").unwrap(),
        Outcome::Migrated
    );
    drop(writer);

    assert!(!base.join("new/monocode.db-wal").exists());
    assert!(!base.join("new/monocode.db-shm").exists());
    let copy = Connection::open(base.join("new/monocode.db")).unwrap();
    let id: String = copy
        .query_row("SELECT id FROM sessions", [], |row| row.get(0))
        .unwrap();
    assert_eq!(id, "in-wal");
    fs::remove_dir_all(base).unwrap();
}

#[cfg(unix)]
#[test]
fn recreates_symlinks() {
    let base = temp_base();
    write(&base.join("old/real"), "data");
    std::os::unix::fs::symlink("real", base.join("old/link")).unwrap();

    assert_eq!(
        migrate_base(&base, "old", "new").unwrap(),
        Outcome::Migrated
    );

    assert_eq!(
        fs::read_link(base.join("new/link")).unwrap(),
        PathBuf::from("real")
    );
    fs::remove_dir_all(base).unwrap();
}

#[test]
fn recognises_monocode_process_names() {
    assert!(is_legacy_process_name(OsStr::new("MonoCode")));
    assert!(is_legacy_process_name(OsStr::new("monocode.exe")));
    assert!(is_legacy_process_name(OsStr::new("mono-code")));
    assert!(!is_legacy_process_name(OsStr::new("monocode-host")));
    assert!(!is_legacy_process_name(OsStr::new("vatra")));
}
