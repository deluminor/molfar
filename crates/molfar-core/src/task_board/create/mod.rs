pub(crate) mod artifact_file;
pub(crate) mod artifacts;
#[cfg(test)]
mod recovery_tests;
#[cfg(test)]
mod tests;
pub(crate) mod validation;

use super::{
    constants::{BACKLOG, IDLE},
    read,
    types::{Card, CardCreate},
};
use rusqlite::{params, Connection, TransactionBehavior};
use std::path::Path;

pub(crate) fn create(
    conn: &mut Connection,
    base: &Path,
    input: &CardCreate,
    projects: &[String],
) -> Result<Card, String> {
    validation::id(&input.id)?;
    let card = if let Some(card) = read::card(conn, &input.id).map_err(|error| error.to_string())? {
        card
    } else {
        let normalized = validation::normalize(input, projects)?;
        insert(conn, &normalized)?
    };
    artifacts::ensure_task(conn, base, &card)?;
    Ok(card)
}

fn insert(conn: &mut Connection, input: &CardCreate) -> Result<Card, String> {
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| error.to_string())?;
    if let Some(card) = read::card(&tx, &input.id).map_err(|error| error.to_string())? {
        return Ok(card);
    }

    let number: i64 = tx
        .query_row(
            "SELECT COALESCE(MAX(number), 0) + 1 FROM task_board_cards",
            [],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    let position: f64 = tx
        .query_row(
            "SELECT COALESCE(MAX(position), 0) + 1 FROM task_board_cards WHERE column_id = ?1",
            [BACKLOG],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    let now = i64::try_from(crate::time::now_ms()).map_err(|error| error.to_string())?;
    tx.execute(
        "INSERT INTO task_board_cards (id, number, project_cwd, title, description, acceptance_criteria, column_id, run_state, position, base_ref, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)",
        params![input.id, number, input.project_cwd, input.title, input.description, input.acceptance_criteria, BACKLOG, IDLE, position, input.base_ref, now],
    ).map_err(|error| error.to_string())?;
    let card = read::card(&tx, &input.id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "Card was not saved.".to_owned())?;
    tx.commit().map_err(|error| error.to_string())?;
    Ok(card)
}
