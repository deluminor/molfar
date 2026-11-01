use super::super::{
    constants::{INITIAL_VERSION, TASK, USER},
    read,
    types::Card,
};
use super::artifact_file;
use rusqlite::{params, Connection, TransactionBehavior};
use std::path::Path;
use uuid::Uuid;

fn task_body(card: &Card) -> String {
    let criteria = card.acceptance_criteria.trim();
    let criteria = if criteria.is_empty() {
        "(none given; derive them in the spec)"
    } else {
        criteria
    };
    format!(
        "# #{} {}\n\n- Project: {}\n- Base branch: {}\n\n## Description\n\n{}\n\n## Acceptance criteria\n\n{}",
        card.number,
        card.title,
        card.project_cwd,
        card.base_ref.as_deref().unwrap_or("(project default)"),
        card.description.trim(),
        criteria,
    )
}

pub(super) fn ensure_task(conn: &mut Connection, base: &Path, card: &Card) -> Result<(), String> {
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| error.to_string())?;
    let exists: bool = tx
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM task_board_artifacts WHERE card_id = ?1 AND kind = ?2)",
            params![card.id, TASK],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    if exists {
        return Ok(());
    }

    let card = read::card(&tx, &card.id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "Card no longer exists.".to_owned())?;
    artifact_file::publish(base, &card.id, &task_body(&card))?;
    let now = i64::try_from(crate::time::now_ms()).map_err(|error| error.to_string())?;
    tx.execute(
        "INSERT INTO task_board_artifacts (id, card_id, kind, version, source, stage_run_id, created_at) VALUES (?1, ?2, ?3, ?4, ?5, NULL, ?6)",
        params![Uuid::new_v4().to_string(), card.id, TASK, INITIAL_VERSION, USER, now],
    ).map_err(|error| error.to_string())?;
    tx.commit().map_err(|error| error.to_string())
}
