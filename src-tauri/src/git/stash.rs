use std::path::Path;

use crate::fs::expand_home;
use crate::git::command::git_checked;
use crate::git::info::git_is_work_tree;

/// Stash tracked and untracked local changes so a checkout can proceed.
#[tauri::command]
pub async fn git_stash(cwd: String, message: Option<String>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        git_stash_for(&expand_home(&cwd), message.as_deref())
    })
    .await
    .map_err(|e| e.to_string())?
}

pub(super) fn git_stash_for(root: &Path, message: Option<&str>) -> Result<(), String> {
    if !git_is_work_tree(root) {
        return Err("Not a git repository".into());
    }
    match message.map(str::trim).filter(|value| !value.is_empty()) {
        Some(message) => git_checked(
            root,
            &["stash", "push", "--include-untracked", "-m", message],
        ),
        None => git_checked(root, &["stash", "push", "--include-untracked"]),
    }
}
