use super::types::RetainedCheckout;
use crate::{
    git,
    task_board::{stage::agent::AgentStage, types::Card},
};
use std::path::Path;

fn branch_exists(project: &Path, branch: &str) -> bool {
    git::git(
        project,
        &[
            "show-ref",
            "--verify",
            "--quiet",
            &format!("refs/heads/{branch}"),
        ],
    )
    .is_ok()
}

fn same_path(left: &str, right: &str) -> bool {
    match (std::fs::canonicalize(left), std::fs::canonicalize(right)) {
        (Ok(left), Ok(right)) => left == right,
        _ => left == right,
    }
}

/// Rebuilds a stage worktree whose directory was removed outside the Board.
/// A surviving branch is reattached as is. A lost branch is recreated from the card's
/// recorded base only before Implement has produced commits worth reviewing.
pub(super) fn missing(
    card: &Card,
    recorded: &str,
    branch: &str,
    base_ref: &str,
    base_sha: &str,
) -> Result<RetainedCheckout, String> {
    let project = Path::new(&card.project_cwd);
    git::git(project, &["worktree", "prune"])?;
    git::git(
        project,
        &[
            "rev-parse",
            "--verify",
            "--end-of-options",
            &format!("{base_sha}^{{commit}}"),
        ],
    )
    .map_err(|error| format!("The card's base commit {base_sha} is gone: {error}"))?;

    let tree = if branch_exists(project, branch) {
        git::create_project_worktree(project, branch, None, true)?
    } else if matches!(
        AgentStage::parse(&card.column_id),
        Some(AgentStage::Grill | AgentStage::Implement)
    ) {
        git::create_project_worktree(project, branch, Some(base_sha), false)?
    } else {
        return Err(format!(
            "The card's worktree and branch {branch} were removed, so there is nothing to review. Move the card back to Plan approval to implement it again."
        ));
    };

    if !same_path(&tree.path, recorded) {
        return Err(format!(
            "Restored the card's worktree at {}, but the card records {recorded}.",
            tree.path
        ));
    }

    Ok(RetainedCheckout {
        path: recorded.into(),
        branch: branch.into(),
        base_ref: base_ref.into(),
        base_sha: base_sha.into(),
    })
}
