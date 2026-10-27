use std::path::Path;

use serde::Serialize;

use crate::fs::{expand_home, path_to_js, MAX_TEXT_FILE_BYTES};
use crate::git::command::{git_blob, git_stdout};
use crate::git::info::git_is_work_tree;
use crate::git::numstat::normalize_diff_path;
use crate::git::output::git_output_capped;
use crate::git::range::{ensure_git_commit, ensure_merge_base};
use crate::github::pr_diff::{MAX_PR_DIFF_BYTES, PR_FULL_CONTEXT_LINES};

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitFileDiff {
    pub path: String,
    pub relative: String,
    pub status: String,
    pub original: String,
    pub current: String,
    pub binary: bool,
    pub too_large: bool,
}

/// Contents for one changed file. Staged diffs compare HEAD to the index;
/// unstaged diffs compare the index to the working tree.
#[tauri::command]
pub async fn git_file_diff(
    cwd: String,
    relative: String,
    staged: bool,
) -> Result<GitFileDiff, String> {
    crate::background_work::read(move || git_file_diff_for(&expand_home(&cwd), &relative, staged))
        .await
        .map_err(|e| e.to_string())?
}

pub(super) fn git_file_diff_for(
    root: &Path,
    relative: &str,
    staged: bool,
) -> Result<GitFileDiff, String> {
    let relative = normalize_diff_path(relative);
    if relative.is_empty()
        || relative.starts_with('/')
        || relative
            .split('/')
            .any(|part| part.is_empty() || part == "..")
    {
        return Err("Invalid path".into());
    }
    let abs = root.join(&relative);
    if !abs.starts_with(root) {
        return Err("Invalid path".into());
    }
    if !git_is_work_tree(root) {
        return Err("Not a git repository".into());
    }

    let prefix = git_stdout(root, &["rev-parse", "--show-prefix"]).unwrap_or_default();
    let index_spec = format!(":{prefix}{relative}");
    let (original, current) = if staged {
        let head_spec = format!("HEAD:{prefix}{relative}");
        (git_blob(root, &head_spec), git_blob(root, &index_spec))
    } else {
        let current = if abs.is_file() {
            Some(std::fs::read(&abs).unwrap_or_default())
        } else {
            None
        };
        (git_blob(root, &index_spec), current)
    };
    let had_original = original.is_some();
    let had_current = current.is_some();
    let orig = original.unwrap_or_default();
    let current = current.unwrap_or_default();
    let binary = orig.contains(&0) || current.contains(&0);
    let too_large =
        orig.len() as u64 > MAX_TEXT_FILE_BYTES || current.len() as u64 > MAX_TEXT_FILE_BYTES;
    let status = if !had_original && had_current {
        if staged {
            "added"
        } else {
            "untracked"
        }
    } else if had_original && !had_current {
        "deleted"
    } else {
        "modified"
    };
    let (original_text, current_text) = if binary || too_large {
        (String::new(), String::new())
    } else {
        (
            String::from_utf8_lossy(&orig).into_owned(),
            String::from_utf8_lossy(&current).into_owned(),
        )
    };
    Ok(GitFileDiff {
        path: path_to_js(&abs),
        relative,
        status: status.to_string(),
        original: original_text,
        current: current_text,
        binary,
        too_large,
    })
}

pub(crate) fn git_diff_full_context(
    root: &Path,
    base: &str,
    head: &str,
) -> Result<(String, bool), String> {
    ensure_git_commit(root, base)?;
    ensure_git_commit(root, head)?;
    ensure_merge_base(root, base, head)?;
    let context = format!("-U{PR_FULL_CONTEXT_LINES}");
    let three_dot = format!("{base}...{head}");
    let (bytes, truncated) = git_output_capped(
        root,
        &[
            "diff",
            "--no-color",
            "--no-ext-diff",
            "--src-prefix=a/",
            "--dst-prefix=b/",
            &context,
            &three_dot,
        ],
        MAX_PR_DIFF_BYTES,
        None,
    )
    .ok_or_else(|| format!("git diff failed for {base}...{head}"))?;
    if truncated {
        return Ok((String::new(), true));
    }
    Ok((String::from_utf8_lossy(&bytes).into_owned(), false))
}

#[cfg(test)]
mod tests;
