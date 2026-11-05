use super::types::TaskEdit;
use crate::task_board::{
    constants::BACKLOG,
    create::{artifacts::task_body, validation},
    types::{Card, CardCreate},
};
use rusqlite::{params, Connection};

/// Writes the edited fields and returns the new task snapshot body; the caller
/// publishes it in the same transaction as the card update.
pub(super) fn apply(conn: &Connection, card: &Card, change: &TaskEdit) -> Result<String, String> {
    if change.base_ref.is_some() && card.column_id != BACKLOG {
        return Err("The base branch is fixed once the card has started.".into());
    }
    let edited = validation::fields(&CardCreate {
        id: card.id.clone(),
        project_cwd: card.project_cwd.clone(),
        title: change.title.clone(),
        description: change.description.clone(),
        acceptance_criteria: change.acceptance_criteria.clone(),
        base_ref: change
            .base_ref
            .clone()
            .unwrap_or_else(|| card.base_ref.clone()),
    })?;

    conn.execute(
        "UPDATE task_board_cards SET title=?2,description=?3,acceptance_criteria=?4,base_ref=?5 WHERE id=?1",
        params![card.id, edited.title, edited.description, edited.acceptance_criteria, edited.base_ref],
    )
    .map_err(|e| e.to_string())?;

    Ok(task_body(&Card {
        title: edited.title,
        description: edited.description,
        acceptance_criteria: edited.acceptance_criteria,
        base_ref: edited.base_ref,
        ..card.clone()
    }))
}
