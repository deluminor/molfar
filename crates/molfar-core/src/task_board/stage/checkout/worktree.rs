use super::{branch, types::RetainedCheckout};
use crate::{git, task_board::types::Card};
use std::path::Path;

fn valid_tree(project: &Path, path: &str, branch: &str) -> Result<String, String> {
    let wanted = std::fs::canonicalize(path)
        .map_err(|error| format!("Retained worktree is missing: {error}"))?;
    let tree = git::worktrees(project)?
        .into_iter()
        .find(|tree| {
            !tree.main
                && !tree.missing
                && tree.branch.as_deref() == Some(branch)
                && std::fs::canonicalize(&tree.path).ok().as_ref() == Some(&wanted)
        })
        .ok_or("Retained worktree does not belong to the card's branch/project.")?;
    Ok(tree.path)
}

/// The card's existing worktree, never recreated: delivery must not resurrect a removed tree.
pub(super) fn retained(card: &Card) -> Result<String, String> {
    let project = Path::new(&card.project_cwd);
    if crate::files::remote::is_remote(project) {
        return Err("Task Board supports local projects only.".into());
    }
    let (Some(path), Some(branch)) = (&card.worktree_path, &card.branch) else {
        return Err("The card has no worktree to deliver.".into());
    };
    if crate::files::remote::is_remote(Path::new(path)) {
        return Err("Task Board supports local projects only.".into());
    }

    valid_tree(project, path, branch)
}

pub(super) fn ensure(card: &Card) -> Result<RetainedCheckout, String> {
    let project = Path::new(&card.project_cwd);
    if crate::files::remote::is_remote(project) {
        return Err("Task Board supports local projects only.".into());
    }
    let branch = card
        .branch
        .clone()
        .unwrap_or_else(|| branch::name(&card.id, &card.title));
    let base_ref = match &card.base_ref {
        Some(base) => base.clone(),
        None => branch::default_base(project)?,
    };
    if let (Some(path), Some(sha)) = (&card.worktree_path, &card.base_sha) {
        if !Path::new(path).exists() {
            return super::restore::missing(card, path, &branch, &base_ref, sha);
        }

        let path = valid_tree(project, path, &branch)?;
        git::git(
            project,
            &[
                "rev-parse",
                "--verify",
                "--end-of-options",
                &format!("{sha}^{{commit}}"),
            ],
        )?;
        return Ok(RetainedCheckout {
            path,
            branch,
            base_ref,
            base_sha: sha.clone(),
        });
    }
    let trees = git::worktrees(project)?;
    let found = trees
        .iter()
        .find(|tree| tree.branch.as_deref() == Some(&branch));
    let tree = if let Some(tree) = found {
        valid_tree(project, &tree.path, &branch)?;
        tree.clone()
    } else {
        match git::create_project_worktree(project, &branch, Some(&base_ref), false) {
            Ok(tree) => tree,
            Err(first) => {
                if let Some(tree) = git::worktrees(project)?
                    .into_iter()
                    .find(|tree| tree.branch.as_deref() == Some(&branch))
                {
                    valid_tree(project, &tree.path, &branch)?;
                    tree
                } else if git::git(
                    project,
                    &[
                        "show-ref",
                        "--verify",
                        "--quiet",
                        &format!("refs/heads/{branch}"),
                    ],
                )
                .is_ok()
                {
                    git::create_project_worktree(project, &branch, Some(&base_ref), true)?
                } else {
                    return Err(first);
                }
            }
        }
    };
    let base_sha = git::git(Path::new(&tree.path), &["rev-parse", "HEAD"])?
        .trim()
        .into();
    Ok(RetainedCheckout {
        path: tree.path,
        branch,
        base_ref,
        base_sha,
    })
}
