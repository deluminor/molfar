use rusqlite::{params, Connection, OptionalExtension, Row};

use super::types::{
    StageRun, StageRunCreate, StageRunPatch, DISPATCHES, RUNTIME_MODES, RUN_STATUSES, STAGES,
};
use super::validate::{git_ref, one_of};
use crate::session_store::validate_id;

const SELECT: &str = "SELECT id, card_id, stage, attempt, session_id, harness, model,
  settings_json, runtime_mode, template_version, dispatch, status, error, head_before,
  porcelain_before, fingerprint_before, head_after, started_at, completed_at FROM task_board_stage_runs";
const MAX_LABEL: usize = 200;
const MAX_BLOB: usize = 200_000;

fn sql_error(error: rusqlite::Error) -> String {
    error.to_string()
}

fn from_row(row: &Row<'_>) -> rusqlite::Result<StageRun> {
    Ok(StageRun {
        id: row.get(0)?,
        card_id: row.get(1)?,
        stage: row.get(2)?,
        attempt: row.get(3)?,
        session_id: row.get(4)?,
        harness: row.get(5)?,
        model: row.get(6)?,
        settings_json: row.get(7)?,
        runtime_mode: row.get(8)?,
        template_version: row.get(9)?,
        dispatch: row.get(10)?,
        status: row.get(11)?,
        error: row.get(12)?,
        head_before: row.get(13)?,
        porcelain_before: row.get(14)?,
        fingerprint_before: row.get(15)?,
        head_after: row.get(16)?,
        started_at: row.get(17)?,
        completed_at: row.get(18)?,
    })
}

fn validate_create(input: &StageRunCreate) -> Result<(), String> {
    validate_id(&input.id, "stage run")?;
    validate_id(&input.card_id, "card")?;
    one_of(&input.stage, &STAGES, "stage")?;
    one_of(&input.runtime_mode, &RUNTIME_MODES, "permission mode")?;
    let label = |value: &str| !value.trim().is_empty() && value.len() <= MAX_LABEL;
    if !label(&input.harness) || !label(&input.model) {
        return Err("Invalid stage model.".into());
    }
    let settings: serde_json::Value = serde_json::from_str(&input.settings_json)
        .map_err(|_| "Invalid stage model settings.".to_string())?;
    if !settings.is_object() || input.settings_json.len() > MAX_LABEL * 10 {
        return Err("Invalid stage model settings.".into());
    }
    if input.template_version < 1 {
        return Err("Invalid template version.".into());
    }
    Ok(())
}

fn validate_patch(patch: &StageRunPatch) -> Result<(), String> {
    if let Some(session) = &patch.session_id {
        validate_id(session, "session")?;
    }
    if let Some(dispatch) = &patch.dispatch {
        one_of(dispatch, &DISPATCHES, "dispatch step")?;
    }
    if let Some(status) = &patch.status {
        one_of(status, &RUN_STATUSES, "stage status")?;
    }
    for sha in [&patch.head_before, &patch.head_after]
        .into_iter()
        .flatten()
    {
        git_ref(sha, "commit")?;
    }
    let too_long =
        |value: &Option<String>| value.as_ref().is_some_and(|text| text.len() > MAX_BLOB);
    let too_long_fingerprint = patch
        .fingerprint_before
        .as_ref()
        .is_some_and(|value| value.len() > 128);
    if too_long(&patch.error) || too_long(&patch.porcelain_before) || too_long_fingerprint {
        return Err("Stage run text is too long.".into());
    }
    Ok(())
}

pub(crate) fn get(conn: &Connection, id: &str) -> Result<Option<StageRun>, String> {
    conn.query_row(&format!("{SELECT} WHERE id = ?1"), [id], from_row)
        .optional()
        .map_err(sql_error)
}

pub(crate) fn list(conn: &Connection, card_id: &str) -> Result<Vec<StageRun>, String> {
    validate_id(card_id, "card")?;
    let mut statement = conn
        .prepare(&format!("{SELECT} WHERE card_id = ?1 ORDER BY rowid"))
        .map_err(sql_error)?;
    let rows = statement
        .query_map([card_id], from_row)
        .map_err(sql_error)?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(sql_error)
}

pub(crate) fn list_running(conn: &Connection) -> Result<Vec<StageRun>, String> {
    let mut statement = conn
        .prepare(&format!(
            "{SELECT} WHERE status = 'running' ORDER BY started_at"
        ))
        .map_err(sql_error)?;
    let rows = statement.query_map([], from_row).map_err(sql_error)?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(sql_error)
}

pub(crate) fn create(
    conn: &mut Connection,
    input: &StageRunCreate,
    now: i64,
) -> Result<StageRun, String> {
    validate_create(input)?;
    let tx = conn.transaction().map_err(sql_error)?;
    let attempt: i64 = tx
        .query_row(
            "SELECT COALESCE(MAX(attempt), 0) + 1 FROM task_board_stage_runs
             WHERE card_id = ?1 AND stage = ?2",
            params![input.card_id, input.stage],
            |row| row.get(0),
        )
        .map_err(sql_error)?;
    tx.execute(
        "INSERT INTO task_board_stage_runs (id, card_id, stage, attempt, harness, model,
           settings_json, runtime_mode, template_version, dispatch, status, started_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'accepted', 'running', ?10)",
        params![
            input.id,
            input.card_id,
            input.stage,
            attempt,
            input.harness,
            input.model,
            input.settings_json,
            input.runtime_mode,
            input.template_version,
            now
        ],
    )
    .map_err(sql_error)?;
    tx.commit().map_err(sql_error)?;
    get(conn, &input.id)?.ok_or_else(|| "Stage run was not saved.".into())
}

/// A settled run is final: later writes would rewrite history the card already acted on.
pub(crate) fn update(
    conn: &Connection,
    id: &str,
    patch: &StageRunPatch,
    now: i64,
) -> Result<StageRun, String> {
    validate_id(id, "stage run")?;
    validate_patch(patch)?;
    let mut run = get(conn, id)?.ok_or_else(|| "Stage run not found.".to_string())?;
    if run.status != "running" {
        return Err("This stage run has already finished.".into());
    }

    let keep = |target: &mut Option<String>, value: &Option<String>| {
        if value.is_some() {
            target.clone_from(value);
        }
    };
    keep(&mut run.session_id, &patch.session_id);
    keep(&mut run.error, &patch.error);
    keep(&mut run.head_before, &patch.head_before);
    keep(&mut run.porcelain_before, &patch.porcelain_before);
    keep(&mut run.fingerprint_before, &patch.fingerprint_before);
    keep(&mut run.head_after, &patch.head_after);
    if let Some(dispatch) = &patch.dispatch {
        run.dispatch.clone_from(dispatch);
    }
    if let Some(status) = &patch.status {
        run.status.clone_from(status);
        if status != "running" {
            run.completed_at = Some(now);
        }
    }

    conn.execute(
        "UPDATE task_board_stage_runs SET session_id = ?2, dispatch = ?3, status = ?4,
           error = ?5, head_before = ?6, porcelain_before = ?7, head_after = ?8,
           completed_at = ?9, fingerprint_before = ?10
         WHERE id = ?1",
        params![
            run.id,
            run.session_id,
            run.dispatch,
            run.status,
            run.error,
            run.head_before,
            run.porcelain_before,
            run.head_after,
            run.completed_at,
            run.fingerprint_before
        ],
    )
    .map_err(sql_error)?;
    Ok(run)
}
