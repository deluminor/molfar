use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};

use serde::Serialize;

use crate::fs::walk_rules::{is_indexable_root, is_private_dir, skip_walk_dir_name, Ignore};
use crate::fs::{expand_home, path_to_js};
use crate::git::ls_files::git_ls_files;

pub(crate) const MAX_PROJECT_FILES: usize = 20_000;
const MAX_WALK_DIRS: usize = 4_000;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ProjectFile {
    pub(crate) name: String,
    pub(crate) path: String,
    pub(crate) relative: String,
}

/// Workspace files for Quick Open. Prefer `git ls-files` (gitignore-aware,
/// index-backed); otherwise a bounded walk that never descends into vendor dirs.
#[tauri::command]
pub async fn list_project_files(cwd: String) -> Result<Vec<ProjectFile>, String> {
    crate::background_work::read(move || list_project_files_sync(&cwd))
        .await
        .map_err(|e| e.to_string())?
}

pub(crate) fn list_project_files_sync(cwd: &str) -> Result<Vec<ProjectFile>, String> {
    list_project_files_sync_cancellable(cwd, None)
}

/// Same listing, but aborts as soon as `cancel` is set.
///
/// Both halves of the enumeration can outlast a cancelled search on their own,
/// so both take the flag: `git ls-files` and the walk it falls back to. The
/// walk is the one that can run for minutes, but the listing is the one that
/// can hold a hundred megabytes, so neither is left uninterruptible.
pub(crate) fn list_project_files_sync_cancellable(
    cwd: &str,
    cancel: Option<&AtomicBool>,
) -> Result<Vec<ProjectFile>, String> {
    let root = expand_home(cwd);
    if !root.is_dir() {
        return Err(format!("{}: Not a directory", root.display()));
    }
    if !is_indexable_root(&root) {
        return Ok(Vec::new());
    }
    if cancel.is_some_and(|token| token.load(Ordering::Acquire)) {
        return Ok(Vec::new());
    }
    if let Some(files) = git_ls_files(&root, cancel) {
        return Ok(files);
    }
    // `git_ls_files` returns `None` for "not a git repo", truncation, and
    // cancel. The first two should walk; cancel must not, or a cancelled
    // `ls-files` would start enumerating the tree it just avoided.
    if cancel.is_some_and(|token| token.load(Ordering::Acquire)) {
        return Ok(Vec::new());
    }
    Ok(walk_project_files(&root, cancel.into()))
}

/// When a file walk should stop early.
///
/// The flag variant is what a search uses. `AfterEntries` exists so the
/// per-entry check can be tested without a thread and a sleep: setting the flag
/// from outside only proves the walk stops *somewhere*, which the up-front
/// check would satisfy on its own, and timing a real cancellation is flaky on
/// loaded CI.
#[derive(Clone, Copy)]
enum WalkStop<'a> {
    Never,
    Flag(&'a AtomicBool),
    #[cfg(test)]
    AfterEntries(usize),
}

impl<'a> WalkStop<'a> {
    fn stopped(&self, _entries: usize) -> bool {
        match self {
            WalkStop::Never => false,
            WalkStop::Flag(flag) => flag.load(Ordering::Acquire),
            #[cfg(test)]
            WalkStop::AfterEntries(limit) => _entries >= *limit,
        }
    }
}

impl<'a> From<Option<&'a AtomicBool>> for WalkStop<'a> {
    fn from(cancel: Option<&'a AtomicBool>) -> Self {
        match cancel {
            Some(flag) => WalkStop::Flag(flag),
            None => WalkStop::Never,
        }
    }
}

fn walk_project_files(root: &Path, stop: WalkStop<'_>) -> Vec<ProjectFile> {
    let ignore = Ignore::load(root);
    let mut files = Vec::new();
    let mut dirs = vec![root.to_path_buf()];
    let mut visited = 0usize;
    let mut seen = 0usize;

    while let Some(dir) = dirs.pop() {
        if stop.stopped(seen) {
            break;
        }
        visited += 1;
        if visited > MAX_WALK_DIRS || files.len() >= MAX_PROJECT_FILES {
            break;
        }
        let Ok(reader) = std::fs::read_dir(&dir) else {
            continue;
        };
        for ent in reader {
            seen += 1;
            if stop.stopped(seen) {
                return files;
            }
            let Ok(ent) = ent else { continue };
            let name = ent.file_name();
            let Some(name) = name.to_str() else { continue };
            if name == ".DS_Store" {
                continue;
            }
            let path = ent.path();
            let is_dir = match ent.file_type() {
                Ok(t) if t.is_symlink() => continue,
                Ok(t) => t.is_dir(),
                Err(_) => path.is_dir(),
            };
            if is_dir {
                if skip_walk_dir_name(name) || ignore.matches(name) || is_private_dir(&path) {
                    continue;
                }
                dirs.push(path);
                continue;
            }
            if ignore.matches(name) {
                continue;
            }
            let Ok(relative) = path.strip_prefix(root) else {
                continue;
            };
            let relative = path_to_js(relative);
            files.push(ProjectFile {
                name: name.to_string(),
                path: path_to_js(&path),
                relative,
            });
            if files.len() >= MAX_PROJECT_FILES {
                break;
            }
        }
    }
    files
}

#[cfg(test)]
mod tests;
