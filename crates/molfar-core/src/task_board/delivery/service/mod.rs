pub mod reject;
mod remote;

use super::{
    port::DeliveryPort,
    record,
    types::{Delivery, DeliveryMethod, Finished, Published},
};
use crate::{
    store::Store,
    task_board::{
        stage::{checkout::policy, lifecycle::storage::query},
        types::Card,
    },
};
use std::{
    path::Path,
    sync::{Mutex, MutexGuard},
};

pub(super) fn lock(store: &Mutex<Store>) -> Result<MutexGuard<'_, Store>, String> {
    store
        .lock()
        .map_err(|_| "Native session store unavailable".into())
}

fn complete(saved: &Delivery, method: DeliveryMethod) -> bool {
    saved.method == method
        && match method {
            DeliveryMethod::Keep => true,
            DeliveryMethod::Pr => saved.pr_url.is_some(),
            DeliveryMethod::Merge => saved.merged,
        }
}

fn worktree_gone(card: &Card) -> bool {
    card.worktree_path
        .as_deref()
        .is_none_or(|path| !Path::new(path).exists())
}

pub fn publish(
    store: &Mutex<Store>,
    port: &impl DeliveryPort,
    id: &str,
    method: DeliveryMethod,
) -> Result<Published, String> {
    let card = lock(store)?.board_card(id)?;
    let previous = record::parse(card.delivery_json.as_deref());
    let worktree = match port.retained_worktree(&card) {
        Ok(path) => path,
        Err(error) => {
            let resumable = previous.as_ref().filter(|saved| complete(saved, method));
            return match resumable {
                Some(saved) if worktree_gone(&card) => Ok(Published {
                    delivery: saved.clone(),
                    card,
                    worktree: None,
                }),
                _ => Err(error),
            };
        }
    };
    policy::clean(&port.snapshot(Path::new(&worktree))?)?;

    let delivery = match method {
        DeliveryMethod::Keep => Delivery {
            method,
            delivered_at: 0,
            pr_url: None,
            merged: false,
        },
        _ => remote::publish(store, port, &card, Path::new(&worktree), method, previous)?,
    };
    let card = lock(store)?.board_save_delivery(id, &delivery)?;
    Ok(Published {
        card,
        delivery,
        worktree: Some(worktree),
    })
}

pub fn finish(
    store: &Mutex<Store>,
    port: &impl DeliveryPort,
    published: Published,
) -> Result<Finished, String> {
    let Published {
        card,
        delivery,
        worktree,
    } = published;
    let project = Path::new(&card.project_cwd);
    let delivered = Delivery {
        delivered_at: query::now()?,
        ..delivery
    };

    let cleanup = worktree
        .as_deref()
        .map(|path| port.remove_worktree(project, Path::new(path), false));
    let warning = match &cleanup {
        Some(Err(error)) => Some(format!(
            "Delivered, but the worktree could not be removed: {error}"
        )),
        _ => None,
    };

    let mut store = lock(store)?;
    let card =
        store.board_finish_delivery(&card.id, &delivered, warning.is_none(), warning.as_deref())?;
    let detached = match (worktree, cleanup) {
        (Some(path), Some(Ok(()))) => store.detach_worktree(&path, &card.project_cwd)?,
        _ => Vec::new(),
    };
    Ok(Finished { card, detached })
}

pub fn fail(store: &Mutex<Store>, id: &str, error: &str) -> Result<Card, String> {
    lock(store)?.board_fail_delivery(id, error)
}
