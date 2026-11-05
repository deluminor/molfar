use super::constants::TASK_BRANCH_PREFIX;
use crate::git::git;
use std::path::Path;
use unicode_normalization::UnicodeNormalization;

pub(super) fn name(card_id: &str, title: &str) -> String {
    let token: String = card_id
        .chars()
        .filter(char::is_ascii_alphanumeric)
        .take(6)
        .map(|c| c.to_ascii_lowercase())
        .collect();
    let normalized: String = title
        .nfkd()
        .flat_map(char::to_lowercase)
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    let slug = normalized
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    let slug: String = slug.chars().take(40).collect();
    let slug = slug.trim_end_matches('-');
    if slug.is_empty() {
        format!("{TASK_BRANCH_PREFIX}{token}")
    } else {
        format!("{TASK_BRANCH_PREFIX}{token}-{slug}")
    }
}

fn exists(root: &Path, reference: &str) -> bool {
    git(root, &["show-ref", "--verify", "--quiet", reference]).is_ok()
}

pub(super) fn remotes(root: &Path) -> Result<Vec<String>, String> {
    Ok(git(root, &["remote"])?
        .lines()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(str::to_owned)
        .collect())
}

pub(super) fn default_base(root: &Path) -> Result<String, String> {
    let names = remotes(root)?;
    let remote = names
        .iter()
        .find(|name| *name == "origin")
        .or_else(|| names.first());
    if let Some(remote) = remote {
        if let Ok(head) = git(
            root,
            &[
                "symbolic-ref",
                "--short",
                &format!("refs/remotes/{remote}/HEAD"),
            ],
        ) {
            let head = head.trim();
            if !head.is_empty() {
                return Ok(format!("refs/remotes/{head}"));
            }
        }
        for branch in ["main", "master"] {
            if exists(root, &format!("refs/remotes/{remote}/{branch}")) {
                return Ok(format!("refs/remotes/{remote}/{branch}"));
            }
        }
    }
    for branch in ["main", "master"] {
        if exists(root, &format!("refs/heads/{branch}")) {
            return Ok(branch.into());
        }
    }
    Err("Could not resolve the project's default branch.".into())
}

/// Deletes a Board branch once its worktree is gone unless it was pushed: a pushed
/// branch may back an open pull request. Returns whether the branch is gone.
pub(super) fn remove_task(root: &Path, branch: &str) -> Result<bool, String> {
    let branch = branch.trim();
    if !branch.starts_with(TASK_BRANCH_PREFIX) {
        return Err("Only Task Board branches can be removed here".into());
    }
    git(root, &["check-ref-format", "--branch", branch])?;
    if !exists(root, &format!("refs/heads/{branch}")) {
        return Ok(true);
    }

    let attached = crate::git::worktrees(root)?
        .iter()
        .any(|tree| tree.branch.as_deref() == Some(branch));
    if attached {
        return Err("The task branch still has a worktree".into());
    }
    if git(
        root,
        &[
            "rev-parse",
            "--abbrev-ref",
            &format!("{branch}@{{upstream}}"),
        ],
    )
    .is_ok()
    {
        return Ok(false);
    }

    git(root, &["branch", "-D", branch]).map(|_| true)
}
