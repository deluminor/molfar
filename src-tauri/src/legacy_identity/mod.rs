//! One-time copy of MonoCode-era data into Vatra's identifier directories.
//!
//! The bundle identifier names every per-app directory (app data, WebView
//! storage), so renaming it would otherwise start users from an empty profile.
//! Runs before `tauri::Builder` because config windows — and their WebView
//! data stores — are created before the `setup` hook.

mod copy;
mod legacy_process;
#[cfg(test)]
mod tests;

use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub const LEGACY_IDENTIFIER: &str = "com.monocode.desktop";
pub const IDENTIFIER: &str = "com.vatra.desktop";

#[derive(Debug, PartialEq, Eq)]
enum Outcome {
    Migrated,
    Skipped,
}

pub fn migrate() {
    let pending: Vec<PathBuf> = base_dirs()
        .into_iter()
        .filter(|base| needs_migration(base, LEGACY_IDENTIFIER, IDENTIFIER))
        .collect();
    if pending.is_empty() {
        return;
    }

    // A running MonoCode keeps writing its stores, so a copy now could pair
    // files from different moments. Marking the migration pending makes the
    // next launch after MonoCode quits pick it up.
    let defer = legacy_process::legacy_app_running();
    if defer {
        eprintln!("vatra: MonoCode is running; its data will be migrated on a later launch");
    }

    for base in pending {
        let result = if defer {
            mark_pending(&base, IDENTIFIER)
        } else {
            migrate_base(&base, LEGACY_IDENTIFIER, IDENTIFIER).map(|_| ())
        };
        if let Err(error) = result {
            eprintln!(
                "vatra: could not migrate legacy data in {}: {error}",
                base.display()
            );
        }
    }
}

fn needs_migration(base: &Path, legacy: &str, current: &str) -> bool {
    base.join(legacy).is_dir()
        && (!base.join(current).exists() || pending_marker(base, current).exists())
}

fn migrate_base(base: &Path, legacy: &str, current: &str) -> io::Result<Outcome> {
    if !needs_migration(base, legacy, current) {
        return Ok(Outcome::Skipped);
    }

    let source = base.join(legacy);
    let target = base.join(current);

    // The app creates `target` right after a failed copy, so its existence
    // cannot mean "migrated". The marker survives until the copy is in place,
    // and a later launch retries.
    mark_pending(base, current)?;

    // Copy into a staging directory and rename it into place, so an
    // interrupted copy is retried instead of being mistaken for a finished one.
    let staging = base.join(format!("{current}.migrating"));
    if staging.exists() {
        fs::remove_dir_all(&staging)?;
    }
    copy::copy_dir(&source, &staging)?;

    if target.exists() {
        let backup = backup_path(base, current);
        fs::rename(&target, &backup)?;
        eprintln!(
            "vatra: kept the profile created before the migration in {}",
            backup.display()
        );
    }
    fs::rename(&staging, &target)?;
    fs::remove_file(pending_marker(base, current))?;

    Ok(Outcome::Migrated)
}

fn pending_marker(base: &Path, current: &str) -> PathBuf {
    base.join(format!("{current}.migration-pending"))
}

fn mark_pending(base: &Path, current: &str) -> io::Result<()> {
    fs::write(pending_marker(base, current), b"")
}

fn backup_path(base: &Path, current: &str) -> PathBuf {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs())
        .unwrap_or_default();

    base.join(format!("{current}.before-migration-{seconds}"))
}

fn base_dirs() -> Vec<PathBuf> {
    let mut dirs = platform_base_dirs();
    dirs.sort();
    dirs.dedup();
    dirs
}

#[cfg(target_os = "macos")]
fn platform_base_dirs() -> Vec<PathBuf> {
    let Some(home) = std::env::var_os("HOME").map(PathBuf::from) else {
        return Vec::new();
    };
    let library = home.join("Library");

    vec![library.join("Application Support"), library.join("WebKit")]
}

#[cfg(all(unix, not(target_os = "macos")))]
fn platform_base_dirs() -> Vec<PathBuf> {
    let home = std::env::var_os("HOME").map(PathBuf::from);
    let xdg = |variable: &str, fallback: &str| {
        std::env::var_os(variable)
            .map(PathBuf::from)
            .filter(|path| path.is_absolute())
            .or_else(|| home.as_ref().map(|home| home.join(fallback)))
    };

    [
        xdg("XDG_DATA_HOME", ".local/share"),
        xdg("XDG_CONFIG_HOME", ".config"),
    ]
    .into_iter()
    .flatten()
    .collect()
}

#[cfg(windows)]
fn platform_base_dirs() -> Vec<PathBuf> {
    ["APPDATA", "LOCALAPPDATA"]
        .into_iter()
        .filter_map(std::env::var_os)
        .map(PathBuf::from)
        .collect()
}
