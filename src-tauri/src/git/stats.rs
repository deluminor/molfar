use std::collections::HashMap;
use std::path::Path;

use serde::Serialize;

use crate::fs::expand_home;
use crate::git::command::git_run;
use crate::git::index::FileAcc;
use crate::git::info::git_is_work_tree;
use crate::git::numstat::{add_numstat_map, add_untracked_map};

#[derive(Serialize, Clone, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitDiffStats {
    pub files: i64,
    pub additions: i64,
    pub deletions: i64,
}

/// Uncommitted line counts for the opened folder: staged + unstaged vs HEAD,
/// plus untracked (gitignore-aware) files counted as additions.
#[tauri::command]
pub async fn git_diff_stats(cwd: String) -> Result<GitDiffStats, String> {
    crate::background_work::read(move || git_diff_stats_for(&expand_home(&cwd)))
        .await
        .map_err(|e| e.to_string())
}

fn git_diff_stats_for(root: &Path) -> GitDiffStats {
    if !git_is_work_tree(root) {
        return GitDiffStats::default();
    }
    let mut files: HashMap<String, FileAcc> = HashMap::new();
    if let Some(text) = git_run(
        root,
        &[
            "diff",
            "-z",
            "--no-ext-diff",
            "--numstat",
            "HEAD",
            "--",
            ".",
        ],
    ) {
        add_numstat_map(&text, &mut files);
    } else {
        if let Some(text) = git_run(
            root,
            &["diff", "-z", "--no-ext-diff", "--numstat", "--", "."],
        ) {
            add_numstat_map(&text, &mut files);
        }
        if let Some(text) = git_run(
            root,
            &[
                "diff",
                "-z",
                "--no-ext-diff",
                "--cached",
                "--numstat",
                "--",
                ".",
            ],
        ) {
            add_numstat_map(&text, &mut files);
        }
    }
    add_untracked_map(root, &mut files);
    let mut additions = 0i64;
    let mut deletions = 0i64;
    for acc in files.values() {
        additions += acc.additions;
        deletions += acc.deletions;
    }
    GitDiffStats {
        files: files.len() as i64,
        additions,
        deletions,
    }
}

#[cfg(test)]
mod tests;
