use super::lock;
use crate::{
    store::Store,
    task_board::{
        delivery::{
            port::DeliveryPort,
            text::{base_branch, pull_request_body, pull_request_number, pull_request_title},
            types::{Delivery, DeliveryMethod, PullRequest, PullRequestDocs},
        },
        stage::contracts::{
            constants::{IMPL_REPORT, PR_DESCRIPTION, REVIEW, SPEC},
            review,
        },
        types::Card,
    },
};
use std::{path::Path, sync::Mutex};

fn request(
    store: &Mutex<Store>,
    port: &impl DeliveryPort,
    card: &Card,
) -> Result<PullRequest, String> {
    let (spec, report, review_text, description) = {
        let store = lock(store)?;
        (
            store.board_latest_artifact(&card.id, SPEC)?,
            store.board_latest_artifact(&card.id, IMPL_REPORT)?,
            store.board_latest_artifact(&card.id, REVIEW)?,
            store.board_latest_artifact(&card.id, PR_DESCRIPTION)?,
        )
    };
    let parsed = review_text
        .as_deref()
        .and_then(|text| review::parse(text).ok());
    let base = card
        .base_ref
        .as_deref()
        .ok_or("The card has no base branch to open a pull request against.")?;
    let head = card.branch.clone().ok_or("The card has no task branch.")?;

    Ok(PullRequest {
        title: pull_request_title(&card.title, spec.as_deref()),
        body: pull_request_body(
            card.number,
            &card.description,
            PullRequestDocs {
                pr_description: description.as_deref(),
                impl_report: report.as_deref(),
                review: parsed.as_ref(),
            },
        ),
        base: base_branch(base, &port.remotes(Path::new(&card.project_cwd))?),
        head,
    })
}

fn open_or_adopt(
    store: &Mutex<Store>,
    port: &impl DeliveryPort,
    card: &Card,
    worktree: &Path,
    record: &mut Delivery,
) -> Result<(), String> {
    let created =
        request(store, port, card).and_then(|request| port.create_pull_request(worktree, &request));
    match created {
        Ok(url) => record.pr_url = Some(url),
        Err(error) => {
            let existing = port.existing_pull_request(worktree).ok_or(error)?;
            record.pr_url = Some(existing.url);
            record.merged |= existing.merged;
        }
    }
    lock(store)?
        .board_save_delivery(&card.id, record)
        .map(|_| ())
}

fn merge(
    store: &Mutex<Store>,
    port: &impl DeliveryPort,
    card: &Card,
    worktree: &Path,
    repo: &str,
    record: &mut Delivery,
) -> Result<(), String> {
    let url = record.pr_url.clone().unwrap_or_default();
    let number = pull_request_number(&url)
        .ok_or_else(|| format!("Opened {url}, but could not read its number to merge it."))?;
    if let Err(error) = port.squash_merge(worktree, repo, number) {
        let merged = port
            .existing_pull_request(worktree)
            .is_some_and(|pr| pr.merged);
        if !merged {
            return Err(error);
        }
    }

    record.merged = true;
    lock(store)?
        .board_save_delivery(&card.id, record)
        .map(|_| ())
}

/// Each finished step is stored before the next, so delivering again resumes
/// instead of opening a second pull request or merging twice.
pub(super) fn publish(
    store: &Mutex<Store>,
    port: &impl DeliveryPort,
    card: &Card,
    worktree: &Path,
    method: DeliveryMethod,
    previous: Option<Delivery>,
) -> Result<Delivery, String> {
    let repo = port.github_repo(worktree).map_err(|error| {
        format!(
            "Only Keep branch is available: GitHub is not reachable for this repository ({error})."
        )
    })?;
    port.push(worktree)?;

    let previous_merged = previous.as_ref().is_some_and(|saved| saved.merged);
    let mut record = Delivery {
        method,
        delivered_at: 0,
        pr_url: previous.and_then(|saved| saved.pr_url),
        merged: previous_merged,
    };
    if record.pr_url.is_none() {
        open_or_adopt(store, port, card, worktree, &mut record)?;
    }
    if method == DeliveryMethod::Merge && !record.merged {
        merge(store, port, card, worktree, &repo, &mut record)?;
    }
    Ok(record)
}
