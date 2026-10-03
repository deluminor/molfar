use std::ffi::OsStr;
use std::fs;
use std::io;
use std::path::Path;

use rusqlite::{Connection, OpenFlags};

use crate::legacy_session_db::LEGACY_FILE;

const SQLITE_SIDECARS: [&str; 3] = ["-wal", "-shm", "-journal"];

/// Copies the legacy app directory. The session database is written as one
/// SQLite snapshot instead of raw db/WAL/SHM files, which could otherwise be
/// captured at different moments.
pub(super) fn copy_dir(source: &Path, target: &Path) -> io::Result<()> {
    copy_tree(source, target, true)
}

fn copy_tree(source: &Path, target: &Path, root: bool) -> io::Result<()> {
    fs::create_dir_all(target)?;

    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let name = entry.file_name();
        let destination = target.join(&name);

        if root && is_session_database_file(&name) {
            if name == LEGACY_FILE {
                snapshot_sqlite(&entry.path(), &destination)?;
            }
            continue;
        }

        let kind = entry.file_type()?;
        if kind.is_dir() {
            copy_tree(&entry.path(), &destination, false)?;
        } else if kind.is_file() {
            fs::copy(entry.path(), &destination)?;
        } else if kind.is_symlink() {
            copy_symlink(&entry.path(), &destination)?;
        }
    }

    Ok(())
}

fn is_session_database_file(name: &OsStr) -> bool {
    let Some(name) = name.to_str() else {
        return false;
    };
    let Some(suffix) = name.strip_prefix(LEGACY_FILE) else {
        return false;
    };

    suffix.is_empty() || SQLITE_SIDECARS.contains(&suffix)
}

fn snapshot_sqlite(source: &Path, destination: &Path) -> io::Result<()> {
    let destination = destination.to_str().ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::InvalidInput,
            format!("{} is not valid UTF-8", destination.display()),
        )
    })?;
    let connection = Connection::open_with_flags(
        source,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(io::Error::other)?;

    connection
        .execute("VACUUM INTO ?1", [destination])
        .map_err(io::Error::other)?;

    Ok(())
}

#[cfg(unix)]
fn copy_symlink(source: &Path, destination: &Path) -> io::Result<()> {
    std::os::unix::fs::symlink(fs::read_link(source)?, destination)
}

// Creating symlinks needs Developer Mode or elevation on Windows, so a link
// is reported rather than failing the whole migration.
#[cfg(windows)]
fn copy_symlink(source: &Path, _destination: &Path) -> io::Result<()> {
    eprintln!(
        "vatra: skipped symbolic link {} while migrating legacy data",
        source.display()
    );
    Ok(())
}
