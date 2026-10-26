use std::collections::HashSet;
use std::io::Write;
use std::path::Path;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};

use crate::fs::path_to_js;
use crate::fs::project_files::{ProjectFile, MAX_PROJECT_FILES};
use crate::fs::walk_rules::path_has_skipped_dir;
use crate::git::command::git_cmd;
use crate::git::output::git_output_capped;

const CHECK_IGNORE_SOME_MATCHED: i32 = 0;
const CHECK_IGNORE_NONE_MATCHED: i32 = 1;

pub(crate) fn git_ignored_names(dir: &Path, names: &[&str]) -> Option<HashSet<String>> {
    if names.is_empty() {
        return Some(HashSet::new());
    }
    let mut child = git_cmd()
        .arg("-C")
        .arg(dir)
        .args(["check-ignore", "--stdin", "-z"])
        .env("GIT_OPTIONAL_LOCKS", "0")
        .env("GIT_TERMINAL_PROMPT", "0")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;

    let mut input = Vec::with_capacity(names.iter().map(|n| n.len() + 1).sum());
    for name in names {
        input.extend_from_slice(name.as_bytes());
        input.push(0);
    }
    let mut stdin = child.stdin.take()?;
    // Write on a separate thread: a large listing can fill the stdout pipe
    // while git still waits for stdin, which would deadlock a serial writer.
    let writer = std::thread::spawn(move || stdin.write_all(&input));
    let output = child.wait_with_output().ok()?;
    writer.join().ok()?.ok()?;

    if !matches!(
        output.status.code(),
        Some(CHECK_IGNORE_SOME_MATCHED | CHECK_IGNORE_NONE_MATCHED)
    ) {
        return None;
    }
    Some(
        output
            .stdout
            .split(|b| *b == 0)
            .filter(|s| !s.is_empty())
            .map(|s| String::from_utf8_lossy(s).into_owned())
            .collect(),
    )
}

/// Ceiling for one `git ls-files` listing. A 2M-file monorepo emits roughly
/// 120 MB of NUL-separated paths; past this the walk takes over, which is
/// bounded by `MAX_PROJECT_FILES` and cancellable.
const MAX_LS_FILES_BYTES: usize = 8 * 1024 * 1024;

pub(crate) fn git_ls_files(root: &Path, cancel: Option<&AtomicBool>) -> Option<Vec<ProjectFile>> {
    // Routed through the bounded reader rather than `Command::output()`: this
    // is the path a cancelled search actually takes, because a repository with
    // a git index never reaches the walk. `output()` buffers the whole listing
    // before anything can look at it, so on a large monorepo it held ~100 MB
    // and ran to completion with no way to interrupt it — the exact cost the
    // walk's cancel check was added to avoid, one function earlier.
    let (raw, truncated) = git_output_capped(
        root,
        &["ls-files", "-co", "--exclude-standard", "-z"],
        MAX_LS_FILES_BYTES,
        cancel,
    )?;
    if truncated {
        // A partial listing would silently hide files from search. Fall back to
        // the walk, which is bounded by its own budget.
        return None;
    }

    let mut files = Vec::new();
    for rel in raw.split(|b| *b == 0) {
        if cancel.is_some_and(|token| token.load(Ordering::Acquire)) {
            return Some(Vec::new());
        }
        if rel.is_empty() {
            continue;
        }
        let relative = path_to_js(Path::new(String::from_utf8_lossy(rel).as_ref()));
        if relative.ends_with('/') || path_has_skipped_dir(&relative) {
            continue;
        }
        let path = root.join(&relative);
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if name == ".DS_Store" {
            continue;
        }
        files.push(ProjectFile {
            name: name.to_string(),
            path: path_to_js(&path),
            relative,
        });
        if files.len() >= MAX_PROJECT_FILES {
            break;
        }
    }
    Some(files)
}
