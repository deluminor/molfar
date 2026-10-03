use super::constants::{
    MAX_DOCUMENT_BYTES, MAX_ENTRIES, MAX_SCAN_BYTES, MAX_SCAN_SECONDS, MAX_WARNINGS,
};
use super::documents;
use super::parse::parse_note;
use super::paths;
use super::types::{CachedNote, VaultConnection, VaultEntry, VaultSnapshot};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

fn warn(snapshot: &mut VaultSnapshot, message: String) {
    if snapshot.warnings.len() < MAX_WARNINGS {
        snapshot.warnings.push(message);
    }
}

pub fn scan(
    connection: VaultConnection,
    cache: &mut HashMap<String, CachedNote>,
    cancel: &AtomicBool,
    progress: impl Fn(usize),
) -> Result<VaultSnapshot, String> {
    let root = paths::validate_root(Path::new(&connection.root))?;
    let mut snapshot = VaultSnapshot {
        connection,
        entries: Vec::new(),
        notes: Vec::new(),
        warnings: Vec::new(),
        truncated: false,
    };
    let mut pending = vec![PathBuf::new()];
    let mut next_cache = HashMap::new();
    let started = Instant::now();
    let mut bytes = 0;
    while let Some(relative_directory) = pending.pop() {
        if cancel.load(Ordering::Relaxed) {
            return Err("Vault scan cancelled.".into());
        }
        let directory = if relative_directory.as_os_str().is_empty() {
            root.clone()
        } else {
            match paths::resolve(&root, &crate::fs::path_to_js(&relative_directory)) {
                Ok(path) => path,
                Err(error) => {
                    warn(&mut snapshot, error);
                    snapshot.truncated = true;
                    continue;
                }
            }
        };
        let reader = match std::fs::read_dir(directory) {
            Ok(reader) => reader,
            Err(error) => {
                warn(
                    &mut snapshot,
                    format!("{}: {error}", relative_directory.display()),
                );
                snapshot.truncated = true;
                continue;
            }
        };
        for entry in reader {
            if cancel.load(Ordering::Relaxed) {
                return Err("Vault scan cancelled.".into());
            }
            if snapshot.entries.len() >= MAX_ENTRIES
                || bytes >= MAX_SCAN_BYTES
                || started.elapsed() >= Duration::from_secs(MAX_SCAN_SECONDS)
            {
                snapshot.truncated = true;
                warn(
                    &mut snapshot,
                    "Scan limit reached; this index is incomplete.".into(),
                );
                snapshot
                    .entries
                    .sort_by(|left, right| left.path.cmp(&right.path));
                *cache = next_cache;
                progress(snapshot.entries.len());
                return Ok(snapshot);
            }
            let entry = match entry {
                Ok(entry) => entry,
                Err(error) => {
                    warn(
                        &mut snapshot,
                        format!("Cannot inspect vault entry: {error}"),
                    );
                    snapshot.truncated = true;
                    continue;
                }
            };
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') {
                continue;
            }
            let path = relative_directory.join(&name);
            let relative = crate::fs::path_to_js(&path);
            let metadata = match std::fs::symlink_metadata(entry.path()) {
                Ok(metadata) => metadata,
                Err(error) => {
                    warn(&mut snapshot, format!("{relative}: {error}"));
                    snapshot.truncated = true;
                    continue;
                }
            };
            if metadata.file_type().is_symlink() {
                warn(&mut snapshot, format!("Skipped symbolic link: {relative}"));
                continue;
            }
            if !metadata.is_dir() && !metadata.is_file() {
                continue;
            }
            let markdown = metadata.is_file() && paths::is_markdown(&path);
            snapshot.entries.push(VaultEntry {
                path: relative.clone(),
                name,
                is_dir: metadata.is_dir(),
                is_markdown: markdown,
            });
            if metadata.is_dir() {
                pending.push(path);
            }
            if snapshot.entries.len().is_multiple_of(200) {
                progress(snapshot.entries.len());
            }
            if !markdown {
                continue;
            }
            if metadata.len() > MAX_DOCUMENT_BYTES {
                warn(
                    &mut snapshot,
                    format!("Skipped note exceeding 2 MiB: {relative}"),
                );
                snapshot.truncated = true;
                continue;
            }
            let modified = metadata.modified().ok();
            bytes += metadata.len();
            let cached = cache
                .get(&relative)
                .filter(|cached| {
                    cached.modified == modified
                        && modified.is_some()
                        && cached.length == metadata.len()
                })
                .cloned();
            let cached = match cached {
                Some(cached) => cached,
                None => match documents::read(&root, &relative) {
                    Ok(document) => {
                        let (note, warning) = parse_note(&relative, &document.body);
                        CachedNote {
                            modified,
                            length: metadata.len(),
                            note,
                            warning,
                        }
                    }
                    Err(error) => {
                        warn(&mut snapshot, error);
                        snapshot.truncated = true;
                        continue;
                    }
                },
            };
            if let Some(warning) = &cached.warning {
                warn(&mut snapshot, format!("{relative}: {warning}"));
            }
            snapshot.notes.push(cached.note.clone());
            next_cache.insert(relative, cached);
        }
    }
    snapshot
        .entries
        .sort_by(|left, right| left.path.cmp(&right.path));
    snapshot
        .notes
        .sort_by(|left, right| left.path.cmp(&right.path));
    *cache = next_cache;
    progress(snapshot.entries.len());

    Ok(snapshot)
}
