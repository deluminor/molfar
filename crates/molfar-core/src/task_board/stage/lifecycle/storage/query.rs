use super::super::{constants::*, types::GrillContext};
use crate::task_board::{
    read,
    types::{Card, StageRun},
};
use rusqlite::{Connection, OptionalExtension};

pub(crate) fn card(conn: &Connection, id: &str) -> Result<Card, String> {
    read::card(conn, id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Board card not found.".into())
}

pub(crate) fn run(conn: &Connection, id: &str) -> Result<StageRun, String> {
    conn.query_row(
        &format!("{} WHERE id=?1", read::RUNS_SELECT),
        [id],
        read::runs_row,
    )
    .optional()
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Board stage run not found.".into())
}

pub(crate) fn latest_id(conn: &Connection, card: &str) -> Result<Option<String>, String> {
    conn.query_row(
        "SELECT id FROM task_board_stage_runs WHERE card_id=?1 ORDER BY rowid DESC LIMIT 1",
        [card],
        |r| r.get(0),
    )
    .optional()
    .map_err(|e| e.to_string())
}

pub(crate) fn context(conn: &Connection, id: &str) -> Result<GrillContext, String> {
    let run = run(conn, id)?;
    let card = card(conn, &run.card_id)?;
    Ok(GrillContext { card, run })
}

pub(crate) fn current(conn: &Connection, ctx: &GrillContext) -> Result<bool, String> {
    Ok(!ctx.card.archived
        && ctx.card.column_id == GRILL
        && ctx.card.run_state == RUNNING
        && ctx.card.grill_round == 1
        && ctx.run.stage == GRILL
        && ctx.run.status == RUNNING
        && latest_id(conn, &ctx.card.id)?.as_deref() == Some(ctx.run.id.as_str()))
}

pub(crate) fn now() -> Result<i64, String> {
    i64::try_from(crate::time::now_ms()).map_err(|e| e.to_string())
}

pub(crate) fn settings(conn: &Connection) -> Result<serde_json::Value, String> {
    let raw: Option<String> = conn
        .query_row("SELECT json FROM task_board_settings WHERE id=1", [], |r| {
            r.get(0)
        })
        .optional()
        .map_err(|e| e.to_string())?;
    raw.map(|raw| {
        serde_json::from_str::<serde_json::Value>(&raw)
            .map_err(|e| format!("Board settings are unreadable: {e}"))
            .and_then(|value| {
                if value.is_object() {
                    Ok(value)
                } else {
                    Err("Board settings must be an object.".into())
                }
            })
    })
    .unwrap_or_else(|| Ok(serde_json::json!({})))
}

pub(crate) fn next_position(conn: &Connection, column: &str) -> Result<f64, String> {
    conn.query_row(
        "SELECT COALESCE(MAX(position),0)+1 FROM task_board_cards WHERE column_id=?1",
        [column],
        |row| row.get(0),
    )
    .map_err(|e| e.to_string())
}
