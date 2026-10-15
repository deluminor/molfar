use rusqlite::{params, Connection, OptionalExtension, Row};

use super::types::{Card, CardCreate, CardPatch, CONFLICT};
use super::validate;
use crate::session_store::validate_id;

pub(super) const SELECT: &str =
    "SELECT id, number, project_cwd, title, description, acceptance_criteria,
  column_id, run_state, position, base_ref, base_sha, branch, worktree_path, grill_round,
  rework_cycle, overrides_json, last_error, delivery_json, archived, queued_at, created_at,
  updated_at FROM task_board_cards";

pub(super) fn sql_error(error: rusqlite::Error) -> String {
    error.to_string()
}

pub(super) fn from_row(row: &Row<'_>) -> rusqlite::Result<Card> {
    Ok(Card {
        id: row.get(0)?,
        number: row.get(1)?,
        project_cwd: row.get(2)?,
        title: row.get(3)?,
        description: row.get(4)?,
        acceptance_criteria: row.get(5)?,
        column_id: row.get(6)?,
        run_state: row.get(7)?,
        position: row.get(8)?,
        base_ref: row.get(9)?,
        base_sha: row.get(10)?,
        branch: row.get(11)?,
        worktree_path: row.get(12)?,
        grill_round: row.get(13)?,
        rework_cycle: row.get(14)?,
        overrides_json: row.get(15)?,
        last_error: row.get(16)?,
        delivery_json: row.get(17)?,
        archived: row.get::<_, i64>(18)? != 0,
        queued_at: row.get(19)?,
        created_at: row.get(20)?,
        updated_at: row.get(21)?,
    })
}

pub(crate) fn get(conn: &Connection, id: &str) -> Result<Option<Card>, String> {
    conn.query_row(&format!("{SELECT} WHERE id = ?1"), [id], from_row)
        .optional()
        .map_err(sql_error)
}

pub(crate) fn list(
    conn: &Connection,
    project: Option<&str>,
    archived: bool,
) -> Result<Vec<Card>, String> {
    let mut statement = conn
        .prepare(&format!(
            "{SELECT} WHERE archived = ?1 AND (?2 IS NULL OR project_cwd = ?2)
             ORDER BY column_id, position, number"
        ))
        .map_err(sql_error)?;
    let rows = statement
        .query_map(params![archived as i64, project], from_row)
        .map_err(sql_error)?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(sql_error)
}

fn next_position(conn: &Connection, column: &str) -> Result<f64, String> {
    conn.query_row(
        "SELECT COALESCE(MAX(position), 0) + 1 FROM task_board_cards WHERE column_id = ?1",
        [column],
        |row| row.get(0),
    )
    .map_err(sql_error)
}

pub(crate) fn create(conn: &mut Connection, input: &CardCreate, now: i64) -> Result<Card, String> {
    validate::create(input)?;
    let tx = conn.transaction().map_err(sql_error)?;
    let number: i64 = tx
        .query_row(
            "SELECT COALESCE(MAX(number), 0) + 1 FROM task_board_cards",
            [],
            |row| row.get(0),
        )
        .map_err(sql_error)?;
    let position = next_position(&tx, "backlog")?;
    tx.execute(
        "INSERT INTO task_board_cards (id, number, project_cwd, title, description,
           acceptance_criteria, column_id, run_state, position, base_ref, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'backlog', 'idle', ?7, ?8, ?9, ?9)",
        params![
            input.id,
            number,
            input.project_cwd,
            input.title.trim(),
            input.description,
            input.acceptance_criteria,
            position,
            input.base_ref,
            now
        ],
    )
    .map_err(sql_error)?;
    tx.commit().map_err(sql_error)?;
    get(conn, &input.id)?.ok_or_else(|| "Card was not saved.".into())
}

fn apply(card: &mut Card, patch: &CardPatch) {
    let text = |target: &mut String, value: &Option<String>| {
        if let Some(value) = value {
            *target = value.clone();
        }
    };
    let nullable = |target: &mut Option<String>, value: &Option<Option<String>>| {
        if let Some(value) = value {
            *target = value.clone();
        }
    };
    text(&mut card.title, &patch.title);
    text(&mut card.description, &patch.description);
    text(&mut card.acceptance_criteria, &patch.acceptance_criteria);
    text(&mut card.column_id, &patch.column_id);
    text(&mut card.run_state, &patch.run_state);
    text(&mut card.overrides_json, &patch.overrides_json);
    nullable(&mut card.base_ref, &patch.base_ref);
    nullable(&mut card.base_sha, &patch.base_sha);
    nullable(&mut card.branch, &patch.branch);
    nullable(&mut card.worktree_path, &patch.worktree_path);
    nullable(&mut card.last_error, &patch.last_error);
    nullable(&mut card.delivery_json, &patch.delivery_json);
    card.grill_round = patch.grill_round.unwrap_or(card.grill_round);
    card.rework_cycle = patch.rework_cycle.unwrap_or(card.rework_cycle);
    card.archived = patch.archived.unwrap_or(card.archived);
}

/// Compare-and-swap on `updated_at`: the desktop and a paired phone may act on
/// the same card, and the second writer must see the first one's result.
pub(crate) fn update(
    conn: &mut Connection,
    id: &str,
    expected_updated_at: i64,
    patch: &CardPatch,
    now: i64,
) -> Result<Card, String> {
    validate_id(id, "card")?;
    validate::patch(patch)?;
    let tx = conn.transaction().map_err(sql_error)?;
    let mut card = get(&tx, id)?.ok_or_else(|| "Card not found.".to_string())?;
    if card.updated_at != expected_updated_at {
        return Err(CONFLICT.into());
    }

    let previous_column = card.column_id.clone();
    let previous_state = card.run_state.clone();
    apply(&mut card, patch);
    card.position = match patch.position {
        Some(position) => position,
        None if card.column_id != previous_column => next_position(&tx, &card.column_id)?,
        None => card.position,
    };
    card.queued_at = match card.run_state.as_str() {
        "queued" if previous_state != "queued" => Some(now),
        "queued" => card.queued_at,
        _ => None,
    };
    card.updated_at = now.max(card.updated_at + 1);

    write(&tx, &card)?;
    tx.commit().map_err(sql_error)?;
    Ok(card)
}

pub(super) fn write(conn: &Connection, card: &Card) -> Result<(), String> {
    conn.execute(
        "UPDATE task_board_cards SET title = ?2, description = ?3, acceptance_criteria = ?4,
           column_id = ?5, run_state = ?6, position = ?7, base_ref = ?8, base_sha = ?9,
           branch = ?10, worktree_path = ?11, grill_round = ?12, rework_cycle = ?13,
           overrides_json = ?14, last_error = ?15, delivery_json = ?16, archived = ?17,
           queued_at = ?18, updated_at = ?19
         WHERE id = ?1",
        params![
            card.id,
            card.title,
            card.description,
            card.acceptance_criteria,
            card.column_id,
            card.run_state,
            card.position,
            card.base_ref,
            card.base_sha,
            card.branch,
            card.worktree_path,
            card.grill_round,
            card.rework_cycle,
            card.overrides_json,
            card.last_error,
            card.delivery_json,
            card.archived as i64,
            card.queued_at,
            card.updated_at
        ],
    )
    .map_err(sql_error)?;
    Ok(())
}

/// Only archived cards can be deleted; the caller removes the artifact folder.
pub(crate) fn delete_archived(conn: &Connection, id: &str) -> Result<(), String> {
    validate_id(id, "card")?;
    let removed = conn
        .execute(
            "DELETE FROM task_board_cards WHERE id = ?1 AND archived = 1",
            [id],
        )
        .map_err(sql_error)?;
    if removed == 0 {
        return Err("Only archived cards can be deleted.".into());
    }
    Ok(())
}
