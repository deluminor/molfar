use super::types::{ExistingPullRequest, PullRequest};
use crate::task_board::{
    stage::checkout::{self, types::CheckoutSnapshot},
    types::Card,
};
use std::path::Path;

const OPEN: &str = "open";
const MERGED: &str = "merged";

/// Git and hosting effects of delivery, so orchestration is testable without a remote.
pub trait DeliveryPort {
    fn retained_worktree(&self, card: &Card) -> Result<String, String>;
    fn snapshot(&self, worktree: &Path) -> Result<CheckoutSnapshot, String>;
    fn default_base(&self, project: &Path) -> Result<String, String>;
    fn remotes(&self, project: &Path) -> Result<Vec<String>, String>;
    fn github_repo(&self, worktree: &Path) -> Result<String, String>;
    fn push(&self, worktree: &Path) -> Result<(), String>;
    fn create_pull_request(&self, worktree: &Path, request: &PullRequest)
        -> Result<String, String>;
    fn existing_pull_request(&self, worktree: &Path) -> Option<ExistingPullRequest>;
    fn squash_merge(&self, worktree: &Path, repo: &str, number: i64) -> Result<(), String>;
    fn remove_worktree(&self, project: &Path, worktree: &Path, force: bool) -> Result<(), String>;
    fn remove_task_branch(&self, project: &Path, branch: &str) -> Result<bool, String>;
}

pub struct GitDelivery;

impl DeliveryPort for GitDelivery {
    fn retained_worktree(&self, card: &Card) -> Result<String, String> {
        checkout::verify_retained(card)
    }

    fn snapshot(&self, worktree: &Path) -> Result<CheckoutSnapshot, String> {
        checkout::snapshot(worktree)
    }

    fn default_base(&self, project: &Path) -> Result<String, String> {
        checkout::default_base(project)
    }

    fn remotes(&self, project: &Path) -> Result<Vec<String>, String> {
        checkout::remotes(project)
    }

    fn github_repo(&self, worktree: &Path) -> Result<String, String> {
        crate::scm::github_repo(worktree)
    }

    fn push(&self, worktree: &Path) -> Result<(), String> {
        crate::scm::push(worktree)
    }

    fn create_pull_request(
        &self,
        worktree: &Path,
        request: &PullRequest,
    ) -> Result<String, String> {
        crate::scm::pr_create(
            worktree,
            &request.title,
            &request.body,
            &request.base,
            &request.head,
        )
    }

    fn existing_pull_request(&self, worktree: &Path) -> Option<ExistingPullRequest> {
        let pr = crate::scm::pr_status(worktree).ok().flatten()?;
        match pr.state.as_str() {
            OPEN => Some(ExistingPullRequest {
                url: pr.url,
                merged: false,
            }),
            MERGED => Some(ExistingPullRequest {
                url: pr.url,
                merged: true,
            }),
            _ => None,
        }
    }

    fn squash_merge(&self, worktree: &Path, repo: &str, number: i64) -> Result<(), String> {
        crate::inbox::github::squash_merge(worktree, repo, number)
    }

    fn remove_worktree(&self, project: &Path, worktree: &Path, force: bool) -> Result<(), String> {
        if force {
            crate::worktree_management::remove(project, worktree)
        } else {
            crate::worktree_management::remove_clean(project, worktree)
        }
    }

    fn remove_task_branch(&self, project: &Path, branch: &str) -> Result<bool, String> {
        checkout::remove_task_branch(project, branch)
    }
}
