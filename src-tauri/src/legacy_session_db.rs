//! Moves the MonoCode-era session database to its Vatra file name.
//!
//! `legacy_identity` copies the old app data directory verbatim, so the
//! database arrives as `monocode.db`; this renames it (with its SQLite
//! sidecars) before the store is opened.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

pub const FILE: &str = "vatra.db";
pub const LEGACY_FILE: &str = "monocode.db";
const SIDECARS: [&str; 2] = ["-wal", "-shm"];
const MOVE_MARKER: &str = "vatra.db.migrating";

#[derive(Debug, PartialEq, Eq)]
pub enum Outcome {
    Migrated,
    Skipped,
}

/// Path of the database to open. Falls back to the legacy file when it could
/// not be moved, so sessions stay visible and the move is retried next launch.
pub fn resolve(dir: &Path) -> PathBuf {
    match migrate(dir) {
        Ok(_) => dir.join(FILE),
        Err(error) => {
            eprintln!(
                "vatra: could not rename the legacy session database in {}: {error}",
                dir.display()
            );
            dir.join(LEGACY_FILE)
        }
    }
}

fn migrate(dir: &Path) -> io::Result<Outcome> {
    let current = dir.join(FILE);
    let legacy = dir.join(LEGACY_FILE);
    let marker = dir.join(MOVE_MARKER);
    if current.exists() {
        if marker.exists() {
            fs::remove_file(&marker)?;
        }
        return Ok(Outcome::Skipped);
    }
    if !legacy.is_file() {
        return Ok(Outcome::Skipped);
    }

    // SQLite replays any `-wal` next to the database it opens, so a sidecar
    // under the new name is adopted only when the marker proves this code
    // moved it there. Anything else is an orphan and every file stays put.
    let resuming = marker.exists();
    for suffix in SIDECARS {
        let target = sidecar(&current, suffix);
        let conflicts = !resuming || sidecar(&legacy, suffix).exists();
        if target.exists() && conflicts {
            return Err(io::Error::new(
                io::ErrorKind::AlreadyExists,
                format!("{} already exists", target.display()),
            ));
        }
    }

    // Sidecars move first; the main file appearing under the new name is the
    // commit point, so an interrupted run resumes on the next launch.
    fs::write(&marker, b"")?;
    for suffix in SIDECARS {
        let source = sidecar(&legacy, suffix);
        if source.exists() {
            fs::rename(&source, sidecar(&current, suffix))?;
        }
    }
    fs::rename(&legacy, &current)?;
    fs::remove_file(&marker)?;

    Ok(Outcome::Migrated)
}

fn sidecar(database: &Path, suffix: &str) -> PathBuf {
    let mut name = database.as_os_str().to_owned();
    name.push(suffix);
    PathBuf::from(name)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("vatra-session-db-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn read(path: PathBuf) -> String {
        fs::read_to_string(path).unwrap()
    }

    #[test]
    fn moves_database_with_sidecars() {
        let dir = temp_dir();
        fs::write(dir.join("monocode.db"), "db").unwrap();
        fs::write(dir.join("monocode.db-wal"), "wal").unwrap();
        fs::write(dir.join("monocode.db-shm"), "shm").unwrap();

        assert_eq!(migrate(&dir).unwrap(), Outcome::Migrated);

        assert_eq!(read(dir.join("vatra.db")), "db");
        assert_eq!(read(dir.join("vatra.db-wal")), "wal");
        assert_eq!(read(dir.join("vatra.db-shm")), "shm");
        assert!(!dir.join("monocode.db").exists());
        assert!(!dir.join(MOVE_MARKER).exists());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn keeps_an_existing_current_database() {
        let dir = temp_dir();
        fs::write(dir.join("monocode.db"), "legacy").unwrap();
        fs::write(dir.join("vatra.db"), "current").unwrap();

        assert_eq!(migrate(&dir).unwrap(), Outcome::Skipped);

        assert_eq!(read(dir.join("vatra.db")), "current");
        assert_eq!(read(dir.join("monocode.db")), "legacy");
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn skips_a_fresh_install() {
        let dir = temp_dir();

        assert_eq!(migrate(&dir).unwrap(), Outcome::Skipped);
        assert_eq!(resolve(&dir), dir.join("vatra.db"));
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn finishes_a_move_interrupted_after_the_sidecars() {
        let dir = temp_dir();
        fs::write(dir.join("monocode.db"), "db").unwrap();
        fs::write(dir.join("vatra.db-wal"), "wal").unwrap();
        fs::write(dir.join(MOVE_MARKER), "").unwrap();

        assert_eq!(migrate(&dir).unwrap(), Outcome::Migrated);

        assert_eq!(read(dir.join("vatra.db")), "db");
        assert_eq!(read(dir.join("vatra.db-wal")), "wal");
        assert!(!dir.join(MOVE_MARKER).exists());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn refuses_a_sidecar_it_did_not_move() {
        let dir = temp_dir();
        fs::write(dir.join("monocode.db"), "db").unwrap();
        fs::write(dir.join("vatra.db-wal"), "orphan wal").unwrap();

        assert_eq!(resolve(&dir), dir.join("monocode.db"));

        assert_eq!(read(dir.join("monocode.db")), "db");
        assert_eq!(read(dir.join("vatra.db-wal")), "orphan wal");
        assert!(!dir.join("vatra.db").exists());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn clears_a_marker_left_after_the_commit_point() {
        let dir = temp_dir();
        fs::write(dir.join("vatra.db"), "db").unwrap();
        fs::write(dir.join(MOVE_MARKER), "").unwrap();

        assert_eq!(migrate(&dir).unwrap(), Outcome::Skipped);

        assert!(!dir.join(MOVE_MARKER).exists());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn opens_the_untouched_legacy_file_on_conflicting_sidecars() {
        let dir = temp_dir();
        fs::write(dir.join("monocode.db"), "db").unwrap();
        fs::write(dir.join("monocode.db-wal"), "legacy wal").unwrap();
        fs::write(dir.join("vatra.db-wal"), "orphan wal").unwrap();

        assert_eq!(resolve(&dir), dir.join("monocode.db"));

        assert_eq!(read(dir.join("monocode.db")), "db");
        assert_eq!(read(dir.join("monocode.db-wal")), "legacy wal");
        assert_eq!(read(dir.join("vatra.db-wal")), "orphan wal");
        fs::remove_dir_all(dir).unwrap();
    }
}
