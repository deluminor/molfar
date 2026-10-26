use std::io::Write;
use std::path::Path;
use std::process::Stdio;

use crate::fs::{expand_home, MAX_TEXT_FILE_BYTES};
use crate::git::command::{git_checked, git_cmd, git_run, resolve_repo_path};
use crate::git::index::git_diff_index_for;

/// Stage a changed file (`git add`).
#[tauri::command]
pub async fn git_stage_file(cwd: String, relative: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || git_stage_file_for(&expand_home(&cwd), &relative))
        .await
        .map_err(|e| e.to_string())?
}

/// Write `contents` into the index for one path, leaving the working tree alone.
#[tauri::command]
pub async fn git_stage_contents(
    cwd: String,
    relative: String,
    contents: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        git_stage_contents_for(&expand_home(&cwd), &relative, contents.as_bytes())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Unstage a file (`git restore --staged`).
#[tauri::command]
pub async fn git_unstage_file(cwd: String, relative: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        git_unstage_file_for(&expand_home(&cwd), &relative)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Discard uncommitted changes so the file matches HEAD (or delete if untracked).
#[tauri::command]
pub async fn git_discard_file(cwd: String, relative: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        git_discard_file_for(&expand_home(&cwd), &relative)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Discard every unstaged change (restore tracked files; delete untracked).
#[tauri::command]
pub async fn git_discard_all(cwd: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || git_discard_all_for(&expand_home(&cwd)))
        .await
        .map_err(|e| e.to_string())?
}

/// Stage every changed file in the repo.
#[tauri::command]
pub async fn git_stage_all(cwd: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        git_checked(&expand_home(&cwd), &["add", "-A", "--", "."])
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Unstage every staged file.
#[tauri::command]
pub async fn git_unstage_all(cwd: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        git_checked(&expand_home(&cwd), &["restore", "--staged", "--", "."])
    })
    .await
    .map_err(|e| e.to_string())?
}

pub(super) fn git_stage_file_for(root: &Path, relative: &str) -> Result<(), String> {
    let relative = resolve_repo_path(root, relative)?;
    git_checked(root, &["--literal-pathspecs", "add", "--", &relative])
}

pub(super) fn git_stage_contents_for(
    root: &Path,
    relative: &str,
    contents: &[u8],
) -> Result<(), String> {
    let relative = resolve_repo_path(root, relative)?;
    if contents.len() as u64 > MAX_TEXT_FILE_BYTES {
        return Err("File too large".into());
    }
    let hash = git_hash_object(root, &relative, contents)?;
    let mode = git_index_mode(root, &relative).unwrap_or_else(|| "100644".into());
    git_checked(
        root,
        &[
            "update-index",
            "--add",
            "--cacheinfo",
            &mode,
            &hash,
            &relative,
        ],
    )
}

fn git_index_mode(root: &Path, relative: &str) -> Option<String> {
    let out = git_run(root, &["ls-files", "--stage", "--", relative])?;
    let mode = out.lines().next()?.split_whitespace().next()?;
    if mode.len() == 6 && mode.bytes().all(|b| b.is_ascii_digit()) {
        Some(mode.to_string())
    } else {
        None
    }
}

fn git_hash_object(root: &Path, relative: &str, contents: &[u8]) -> Result<String, String> {
    let mut child = git_cmd()
        .arg("--no-pager")
        .arg("-C")
        .arg(root)
        .args(["hash-object", "-w", "--path", relative, "--stdin"])
        .env("GIT_OPTIONAL_LOCKS", "0")
        .env("GIT_TERMINAL_PROMPT", "0")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| "hash-object stdin".to_string())?;
    stdin.write_all(contents).map_err(|e| e.to_string())?;
    drop(stdin);
    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let msg = stderr.trim();
        if !msg.is_empty() {
            return Err(msg.to_string());
        }
        let msg = stdout.trim();
        if !msg.is_empty() {
            return Err(msg.to_string());
        }
        return Err("git hash-object failed".into());
    }
    let hash = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if hash.len() != 40 && hash.len() != 64 {
        return Err("git hash-object returned an invalid hash".into());
    }
    Ok(hash)
}

fn git_unstage_file_for(root: &Path, relative: &str) -> Result<(), String> {
    let relative = resolve_repo_path(root, relative)?;
    git_checked(
        root,
        &[
            "--literal-pathspecs",
            "restore",
            "--staged",
            "--",
            &relative,
        ],
    )
}

fn git_discard_file_for(root: &Path, relative: &str) -> Result<(), String> {
    let relative = resolve_repo_path(root, relative)?;
    let abs = root.join(&relative);
    if git_checked(root, &["ls-files", "--error-unmatch", "--", &relative]).is_err() {
        if abs.is_file() {
            std::fs::remove_file(&abs).map_err(|e| e.to_string())?;
        } else if abs.exists() {
            git_checked(root, &["clean", "-fd", "--", &relative])?;
        }
        return Ok(());
    }
    git_checked(root, &["restore", "--worktree", "--", &relative])
}

fn git_discard_all_for(root: &Path) -> Result<(), String> {
    let files: Vec<String> = git_diff_index_for(root)
        .files
        .into_iter()
        .filter(|file| file.unstaged)
        .map(|file| file.relative)
        .collect();
    for relative in files {
        git_discard_file_for(root, &relative)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests;
