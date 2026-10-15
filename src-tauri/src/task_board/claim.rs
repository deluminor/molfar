use rusqlite::{Connection, OptionalExtension};

use super::cards::{from_row, sql_error, write, SELECT};
use super::types::Card;

/// Atomically moves the oldest queued card to `running` while fewer than
/// `limit` cards run, so two engine ticks can never start the same stage.
pub(crate) fn claim_next(
    conn: &mut Connection,
    limit: i64,
    now: i64,
) -> Result<Option<Card>, String> {
    let tx = conn.transaction().map_err(sql_error)?;
    let running: i64 = tx
        .query_row(
            "SELECT COUNT(*) FROM task_board_cards WHERE run_state = 'running' AND archived = 0",
            [],
            |row| row.get(0),
        )
        .map_err(sql_error)?;
    if running >= limit {
        return Ok(None);
    }

    let next = tx
        .query_row(
            &format!(
                "{SELECT} WHERE run_state = 'queued' AND archived = 0
                 ORDER BY queued_at, number LIMIT 1"
            ),
            [],
            from_row,
        )
        .optional()
        .map_err(sql_error)?;
    let Some(mut card) = next else {
        return Ok(None);
    };

    card.run_state = "running".into();
    card.queued_at = None;
    card.updated_at = now.max(card.updated_at + 1);
    write(&tx, &card)?;
    tx.commit().map_err(sql_error)?;
    Ok(Some(card))
}
