use std::path::Path;

use serde::Serialize;

use crate::fs::expand_home;
use crate::git::command::{git_output, git_run};
use crate::git::info::git_branch;
use crate::git::remote::{git_default_branch, git_ref_exists, git_remote_name};
use crate::github::repo::github_fetch_remote;

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitRangeContext {
    pub base: String,
    pub head: String,
    pub commit_summary: String,
    pub diff_summary: String,
    pub diff_patch: String,
}

/// Commits and diff between the default branch and HEAD, for PR text generation.
#[tauri::command]
pub async fn git_range_context(cwd: String) -> Result<GitRangeContext, String> {
    tauri::async_runtime::spawn_blocking(move || git_range_context_for(&expand_home(&cwd)))
        .await
        .map_err(|e| e.to_string())?
}

/// Commits and diff between a fixed base commit and HEAD, for task cards.
#[tauri::command]
pub async fn git_range_diff(cwd: String, base: String) -> Result<GitRangeContext, String> {
    tauri::async_runtime::spawn_blocking(move || git_range_diff_for(&expand_home(&cwd), &base))
        .await
        .map_err(|e| e.to_string())?
}

pub(super) fn git_range_context_for(root: &Path) -> Result<GitRangeContext, String> {
    let head = git_branch(root).ok_or_else(|| "Not on a branch".to_string())?;
    let remote = git_remote_name(root);
    let default_branch = git_default_branch(root, remote.as_deref())
        .ok_or_else(|| "Could not resolve the default branch".to_string())?;
    let base_ref = match &remote {
        Some(remote)
            if git_ref_exists(root, &format!("refs/remotes/{remote}/{default_branch}")) =>
        {
            format!("{remote}/{default_branch}")
        }
        _ => default_branch.clone(),
    };
    let mut context = range_context_between(root, &base_ref, head)?;
    if context.commit_summary.trim().is_empty() && context.diff_patch.trim().is_empty() {
        return Err("No commits to include in a pull request".into());
    }
    context.base = default_branch;
    Ok(context)
}

fn range_context_between(
    root: &Path,
    base_ref: &str,
    head: String,
) -> Result<GitRangeContext, String> {
    let spec = format!("{base_ref}...HEAD");
    let commit_summary =
        git_run(root, &["log", "--format=%s", &format!("{base_ref}..HEAD")]).unwrap_or_default();
    let diff_summary = git_run(root, &["diff", "--stat", &spec]).unwrap_or_default();
    let diff_patch = git_run(root, &["diff", "--no-ext-diff", &spec]).unwrap_or_default();
    Ok(GitRangeContext {
        base: base_ref.to_string(),
        head,
        commit_summary,
        diff_summary,
        diff_patch,
    })
}

/// A task card's commits and diff against the commit it started from. Unlike
/// `git_range_context`, an empty range is a valid answer here.
fn git_range_diff_for(root: &Path, base: &str) -> Result<GitRangeContext, String> {
    if base.is_empty() || base.starts_with('-') || base.contains("..") {
        return Err("Invalid base commit".into());
    }
    let commit = format!("{base}^{{commit}}");
    if git_output(root, &["rev-parse", "--verify", "--quiet", &commit]).is_none() {
        return Err(format!("Base commit {base} is not in this repository"));
    }
    let head = git_run(root, &["rev-parse", "HEAD"])
        .map(|sha| sha.trim().to_string())
        .ok_or_else(|| "Could not read HEAD".to_string())?;
    range_context_between(root, base, head)
}

pub(super) fn ensure_merge_base(root: &Path, base: &str, head: &str) -> Result<(), String> {
    if merge_base_exists(root, base, head) {
        return Ok(());
    }
    if let Some(remote) = github_fetch_remote(root) {
        for deepen in ["50", "200", "800"] {
            let _ = git_output(root, &["fetch", "--no-tags", "--deepen", deepen, &remote]);
            if merge_base_exists(root, base, head) {
                return Ok(());
            }
        }
    }
    Err(format!(
        "Cannot find a merge base for {base} and {head}. Fetch more history and try again."
    ))
}

fn merge_base_exists(root: &Path, base: &str, head: &str) -> bool {
    git_output(root, &["merge-base", base, head]).is_some()
}

pub(super) fn ensure_git_commit(root: &Path, oid: &str) -> Result<(), String> {
    let spec = format!("{oid}^{{commit}}");
    if git_output(root, &["cat-file", "-e", &spec]).is_some() {
        return Ok(());
    }
    if let Some(remote) = github_fetch_remote(root) {
        let _ = git_output(root, &["fetch", "--no-tags", "--depth", "1", &remote, oid]);
    }
    if git_output(root, &["cat-file", "-e", &spec]).is_some() {
        return Ok(());
    }
    Err(format!(
        "Missing git commit {oid}. Fetch the pull request refs and try again."
    ))
}

#[cfg(test)]
mod tests;
