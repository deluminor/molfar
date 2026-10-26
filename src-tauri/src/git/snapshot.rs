use std::path::Path;

use serde::Serialize;

use crate::fs::expand_home;
use crate::git::command::{git_output, git_run};

/// HEAD plus porcelain status for the task board's read-only and commit checks.
#[tauri::command]
pub async fn git_snapshot(cwd: String) -> Result<GitSnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || git_snapshot_for(&expand_home(&cwd)))
        .await
        .map_err(|e| e.to_string())?
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitSnapshot {
    pub head: String,
    pub porcelain: String,
    /// Hash of every uncommitted byte: tracked changes and untracked files.
    pub fingerprint: String,
}

/// HEAD and the full working-tree status, compared before and after a task
/// stage to prove a read-only stage left the checkout untouched.
pub(super) fn git_snapshot_for(root: &Path) -> Result<GitSnapshot, String> {
    let head = git_run(root, &["rev-parse", "HEAD"])
        .map(|sha| sha.trim().to_string())
        .ok_or_else(|| "Could not read HEAD".to_string())?;
    let porcelain = git_run(root, &["status", "--porcelain=v1", "--untracked-files=all"])
        .ok_or_else(|| "Could not read the working tree status".to_string())?;
    let fingerprint = working_tree_fingerprint(root)?;
    Ok(GitSnapshot {
        head,
        porcelain,
        fingerprint,
    })
}

/// Status lines only say a file is dirty; this also changes when an already
/// dirty file is edited again.
fn working_tree_fingerprint(root: &Path) -> Result<String, String> {
    use sha2::{Digest, Sha256};

    let diff = git_output(root, &["diff", "HEAD", "--binary", "--no-ext-diff"])
        .ok_or_else(|| "Could not read the working tree diff".to_string())?;
    let untracked = git_output(root, &["ls-files", "-o", "--exclude-standard", "-z"])
        .ok_or_else(|| "Could not list untracked files".to_string())?;

    let mut hasher = Sha256::new();
    hasher.update(&diff);
    for path in untracked
        .split(|byte| *byte == 0)
        .filter(|path| !path.is_empty())
    {
        hasher.update(path);
        let relative = String::from_utf8_lossy(path);
        match std::fs::read(root.join(relative.as_ref())) {
            Ok(bytes) => hasher.update(&bytes),
            Err(error) => hasher.update(error.to_string().as_bytes()),
        }
    }
    Ok(format!("{:x}", hasher.finalize()))
}

#[cfg(test)]
mod tests;
