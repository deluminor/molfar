use super::{detach, lock};
use crate::{
    store::Store,
    task_board::{
        constants::DONE,
        delivery::{port::DeliveryPort, types::Finished},
        types::Card,
    },
};
use std::{path::Path, sync::Mutex};

/// Done cards keep their branch and only lose a leftover clean worktree; other
/// cards drop the worktree and any task branch that was never pushed.
pub fn reject_cleanup(
    store: &Mutex<Store>,
    port: &impl DeliveryPort,
    before: &Card,
    archived: Card,
) -> Result<Finished, String> {
    let project = Path::new(&before.project_cwd);
    let delivered = before.column_id == DONE;
    let mut detached = Vec::new();
    let mut notice = None;
    let removed = before.worktree_path.is_some();

    if let Some(path) = &before.worktree_path {
        if let Err(error) = port.remove_worktree(project, Path::new(path), !delivered) {
            let message = format!("Archived, but the worktree could not be removed: {error}");
            let card = lock(store)?.board_note_archived(&before.id, Some(path), &message)?;
            return Ok(Finished {
                card,
                removed: false,
                detached,
                notice,
            });
        }
        (detached, notice) = detach(&*lock(store)?, path, &before.project_cwd);
    }

    let branch = before.branch.as_deref().filter(|_| !delivered);
    if let Some(Err(error)) = branch.map(|name| port.remove_task_branch(project, name)) {
        let message = format!("Archived, but the task branch could not be removed: {error}");
        let card = lock(store)?.board_note_archived(&before.id, None, &message)?;
        return Ok(Finished {
            card,
            removed,
            detached,
            notice,
        });
    }

    Ok(Finished {
        card: archived,
        removed,
        detached,
        notice,
    })
}
