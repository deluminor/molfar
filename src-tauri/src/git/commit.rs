use std::path::Path;

use serde::Serialize;

use crate::fs::{expand_home, path_to_js};
use crate::git::command::{git_checked, git_cmd, git_run, git_stdout};
use crate::git::info::git_branch;
use crate::git::selection::{git_commit_selected_for, git_selected_context_for};

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitStagedContext {
    pub branch: Option<String>,
    pub summary: String,
    pub patch: String,
}

#[derive(Serialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitFileLocation {
    pub root: String,
    pub relative: String,
}

/// Locate each file's own checkout, including files whose parents were deleted.
#[tauri::command]
pub async fn git_locate_files(paths: Vec<String>) -> Result<Vec<Option<GitFileLocation>>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        paths
            .iter()
            .map(|path| git_locate_file(&expand_home(path)))
            .collect()
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Staged diff (or unstaged vs HEAD if nothing is staged) for commit text generation.
#[tauri::command]
pub async fn git_staged_context(
    cwd: String,
    paths: Option<Vec<String>>,
) -> Result<GitStagedContext, String> {
    tauri::async_runtime::spawn_blocking(move || match paths {
        Some(paths) => git_selected_context_for(&expand_home(&cwd), &paths),
        None => git_staged_context_for(&expand_home(&cwd)),
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Create a commit from the current index, or rewrite HEAD with it when `amend` is set.
#[tauri::command]
pub async fn git_commit(
    cwd: String,
    message: String,
    amend: bool,
    paths: Option<Vec<String>>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = expand_home(&cwd);
        if let Some(paths) = paths {
            if amend {
                return Err("Selected-file commits cannot amend HEAD".into());
            }
            git_commit_selected_for(&root, &message, &paths)
        } else if amend {
            git_commit_amend_for(&root, &message)
        } else {
            git_commit_for(&root, &message)
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Full message (subject and body) of the commit at HEAD.
#[tauri::command]
pub async fn git_head_message(cwd: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || git_head_message_for(&expand_home(&cwd)))
        .await
        .map_err(|e| e.to_string())?
}

pub(super) fn git_staged_context_for(root: &Path) -> Result<GitStagedContext, String> {
    let mut summary = git_run(root, &["diff", "--cached", "--stat", "--", "."]).unwrap_or_default();
    let mut patch =
        git_run(root, &["diff", "--cached", "--no-ext-diff", "--", "."]).unwrap_or_default();

    if summary.trim().is_empty() && patch.trim().is_empty() {
        summary = git_run(root, &["diff", "HEAD", "--stat", "--", "."]).unwrap_or_default();
        patch = git_run(root, &["diff", "HEAD", "--no-ext-diff", "--", "."]).unwrap_or_default();
        if let Some(untracked) = git_run(root, &["ls-files", "--others", "--exclude-standard"]) {
            let names = untracked.trim();
            if !names.is_empty() {
                if !summary.trim().is_empty() {
                    summary.push('\n');
                }
                summary.push_str("Untracked files:\n");
                summary.push_str(names);
            }
        }
    }

    if summary.trim().is_empty() && patch.trim().is_empty() {
        return Err("No changes to summarize".into());
    }

    Ok(GitStagedContext {
        branch: git_branch(root),
        summary,
        patch,
    })
}

pub(super) fn git_locate_file(path: &Path) -> Result<Option<GitFileLocation>, String> {
    if !path.is_absolute() || path.as_os_str().to_string_lossy().contains('\0') {
        return Err("Invalid file path".into());
    }
    let mut parent = path.parent().ok_or("Invalid file path")?;
    while !parent.is_dir() {
        parent = parent.parent().ok_or("File has no existing parent")?;
    }
    // Canonicalize parents rather than the file: deleted files still have a
    // location, and a tracked symlink belongs to the checkout holding the link.
    let directory = std::fs::canonicalize(parent).map_err(|e| e.to_string())?;
    let actual = directory.join(path.strip_prefix(parent).map_err(|e| e.to_string())?);
    let output = git_cmd(&directory)
        .args(["rev-parse", "--show-toplevel"])
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        let error = String::from_utf8_lossy(&output.stderr);
        return if error.contains("not a git repository") {
            Ok(None)
        } else {
            Err(error.trim().into())
        };
    }
    let top = String::from_utf8(output.stdout).map_err(|e| e.to_string())?;
    let top = Path::new(top.trim_end_matches(['\r', '\n']));
    let repo = std::fs::canonicalize(top).map_err(|e| e.to_string())?;
    let relative = actual.strip_prefix(&repo).map_err(|e| e.to_string())?;
    Ok(Some(GitFileLocation {
        // Git supplies a usable Windows path without canonicalize's verbatim prefix.
        root: path_to_js(top),
        relative: path_to_js(relative),
    }))
}

pub(super) fn git_commit_for(root: &Path, message: &str) -> Result<(), String> {
    git_commit_args(root, message, &[])
}

pub(super) fn git_commit_amend_for(root: &Path, message: &str) -> Result<(), String> {
    git_commit_args(root, message, &["--amend"])
}

fn git_commit_args(root: &Path, message: &str, extra: &[&str]) -> Result<(), String> {
    let message = message.trim();
    if message.is_empty() {
        return Err("Commit message cannot be empty".into());
    }
    let mut args = vec!["commit"];
    args.extend_from_slice(extra);
    args.extend(["--cleanup=strip", "-m", message]);
    git_checked(root, &args).map_err(with_signing_hint)
}

/// Explain why signing fails here when the same commit works in a terminal.
pub(super) fn with_signing_hint(error: String) -> String {
    if !error.contains("failed to sign") && !error.contains("ssh-keygen") {
        return error;
    }
    format!(
        "{error}\n\nGit couldn't sign this commit. MOLFAR runs git without a terminal, \
         so your signer needs a GUI passphrase prompt (e.g. pinentry-mac) or an unlocked agent."
    )
}

fn git_head_message_for(root: &Path) -> Result<String, String> {
    git_stdout(root, &["log", "-1", "--pretty=%B"]).ok_or_else(|| "No commits yet".to_string())
}

#[cfg(test)]
mod tests;
