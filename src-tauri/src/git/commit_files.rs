use std::collections::{HashMap, HashSet};
use std::path::Path;

use crate::fs::{expand_home, path_to_js, MAX_TEXT_FILE_BYTES};
use crate::git::command::{git_blob, git_run, git_stdout, resolve_repo_path};
use crate::git::file_diff::GitFileDiff;
use crate::git::history::git_peel_commit;
use crate::git::index::{FileAcc, GitChangedFile};
use crate::git::info::git_is_work_tree;
use crate::git::numstat::{add_name_status, add_numstat_map};

/// Files changed in one commit (first parent / root).
#[tauri::command]
pub async fn git_commit_files(cwd: String, sha: String) -> Result<Vec<GitChangedFile>, String> {
    crate::background_work::read(move || git_commit_files_for(&expand_home(&cwd), &sha))
        .await
        .map_err(|e| e.to_string())?
}

/// Parent vs commit contents for one path in a historical commit.
#[tauri::command]
pub async fn git_commit_file_diff(
    cwd: String,
    sha: String,
    relative: String,
) -> Result<GitFileDiff, String> {
    crate::background_work::read(move || {
        git_commit_file_diff_for(&expand_home(&cwd), &sha, &relative)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn git_commit_files_for(root: &Path, sha: &str) -> Result<Vec<GitChangedFile>, String> {
    if !git_is_work_tree(root) {
        return Err("Not a git repository".into());
    }
    let sha = git_peel_commit(root, sha)?;
    let mut files: HashMap<String, FileAcc> = HashMap::new();
    let mut statuses: HashMap<String, &'static str> = HashMap::new();
    if let Some(text) = git_run(
        root,
        &[
            "diff-tree",
            "-z",
            "--no-commit-id",
            "-r",
            "--root",
            "--no-renames",
            "--numstat",
            &sha,
        ],
    ) {
        add_numstat_map(&text, &mut files);
    }
    if let Some(names) = git_run(
        root,
        &[
            "diff-tree",
            "-z",
            "--no-commit-id",
            "-r",
            "--root",
            "--no-renames",
            "--name-status",
            &sha,
        ],
    ) {
        add_name_status(&names, &mut statuses);
    }
    let mut out = Vec::with_capacity(files.len().max(statuses.len()));
    let mut seen = HashSet::new();
    for (relative, acc) in files {
        seen.insert(relative.clone());
        let status = statuses.get(&relative).copied().unwrap_or("modified");
        out.push(GitChangedFile {
            path: path_to_js(&root.join(&relative)),
            relative,
            status: status.to_string(),
            additions: acc.additions,
            deletions: acc.deletions,
            staged: false,
            unstaged: false,
        });
    }
    for (relative, status) in statuses {
        if seen.contains(&relative) {
            continue;
        }
        out.push(GitChangedFile {
            path: path_to_js(&root.join(&relative)),
            relative,
            status: status.to_string(),
            additions: 0,
            deletions: 0,
            staged: false,
            unstaged: false,
        });
    }
    out.sort_by(|a, b| a.relative.cmp(&b.relative));
    Ok(out)
}

fn git_commit_file_diff_for(root: &Path, sha: &str, relative: &str) -> Result<GitFileDiff, String> {
    let relative = resolve_repo_path(root, relative)?;
    if !git_is_work_tree(root) {
        return Err("Not a git repository".into());
    }
    let sha = git_peel_commit(root, sha)?;
    let parent = git_stdout(root, &["rev-parse", "--verify", &format!("{sha}^")]);
    let original_bytes = match &parent {
        Some(parent) => git_blob(root, &format!("{parent}:{relative}")).unwrap_or_default(),
        None => Vec::new(),
    };
    let current_bytes = git_blob(root, &format!("{sha}:{relative}")).unwrap_or_default();
    let binary = original_bytes.contains(&0) || current_bytes.contains(&0);
    let too_large = original_bytes.len() as u64 > MAX_TEXT_FILE_BYTES
        || current_bytes.len() as u64 > MAX_TEXT_FILE_BYTES;
    let status = if original_bytes.is_empty() && !current_bytes.is_empty() {
        "added"
    } else if !original_bytes.is_empty() && current_bytes.is_empty() {
        "deleted"
    } else {
        "modified"
    };
    let (original, current) = if binary || too_large {
        (String::new(), String::new())
    } else {
        (
            String::from_utf8_lossy(&original_bytes).into_owned(),
            String::from_utf8_lossy(&current_bytes).into_owned(),
        )
    };
    Ok(GitFileDiff {
        path: path_to_js(&root.join(&relative)),
        relative,
        status: status.to_string(),
        original,
        current,
        binary,
        too_large,
    })
}

#[cfg(test)]
mod tests;
