use super::constants::COLUMNS;
use super::types::{ArtifactMeta, Card, Snapshot, StageRun};
use rusqlite::{params, Connection, OptionalExtension, Row};

const CARDS_SELECT: &str =
    "SELECT id, number, project_cwd, title, description, acceptance_criteria,
  column_id, run_state, position, base_ref, base_sha, branch, worktree_path, grill_round,
  rework_cycle, overrides_json, last_error, delivery_json, archived, queued_at, created_at,
  updated_at FROM task_board_cards";

fn cards_row(row: &Row<'_>) -> rusqlite::Result<Card> {
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

pub(crate) fn card(conn: &Connection, id: &str) -> rusqlite::Result<Option<Card>> {
    conn.query_row(&format!("{CARDS_SELECT} WHERE id = ?1"), [id], cards_row)
        .optional()
}

pub(crate) const RUNS_SELECT: &str = "SELECT id, card_id, stage, attempt, session_id, harness, model,
  settings_json, runtime_mode, template_version, dispatch, status, error, head_before,
  porcelain_before, fingerprint_before, head_after, started_at, completed_at FROM task_board_stage_runs";

pub(crate) fn runs_row(row: &Row<'_>) -> rusqlite::Result<StageRun> {
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

pub(crate) const ARTIFACTS_SELECT: &str =
    "SELECT id, card_id, kind, version, source, stage_run_id, created_at FROM task_board_artifacts";

pub(crate) fn artifacts_row(row: &Row<'_>) -> rusqlite::Result<ArtifactMeta> {
    Ok(ArtifactMeta {
        id: row.get(0)?,
        card_id: row.get(1)?,
        kind: row.get(2)?,
        version: row.get(3)?,
        source: row.get(4)?,
        stage_run_id: row.get(5)?,
        created_at: row.get(6)?,
    })
}

pub(crate) fn snapshot(
    conn: &Connection,
    project: Option<&str>,
    archived: bool,
    selected: Option<&str>,
) -> Result<Snapshot, String> {
    load(conn, project, archived, selected)
        .map_err(|error| format!("Cannot read Task Board: {error}. The database was not changed."))
}

fn load(
    conn: &Connection,
    project: Option<&str>,
    archived: bool,
    selected: Option<&str>,
) -> rusqlite::Result<Snapshot> {
    let tx = conn.unchecked_transaction()?;
    let mut cards = tx.prepare(&format!(
        "{CARDS_SELECT} WHERE archived = ?1 AND (?2 IS NULL OR project_cwd = ?2) ORDER BY position, number"
    ))?.query_map(params![archived, project], cards_row)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    cards.sort_by_key(|card| {
        COLUMNS
            .iter()
            .position(|(id, _)| *id == card.column_id)
            .unwrap_or(COLUMNS.len())
    });
    let selected = selected
        .and_then(|id| cards.iter().find(|card| card.id == id))
        .or_else(|| cards.first())
        .map(|card| card.id.clone());
    let runs = tx
        .prepare(&format!(
            "{RUNS_SELECT} WHERE card_id = ?1 ORDER BY started_at, id"
        ))?
        .query_map([selected.as_deref()], runs_row)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let artifacts = tx
        .prepare(&format!(
            "{ARTIFACTS_SELECT} WHERE card_id = ?1 ORDER BY kind, version"
        ))?
        .query_map([selected.as_deref()], artifacts_row)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let settings_json = tx
        .query_row(
            "SELECT json FROM task_board_settings WHERE id = 1",
            [],
            |row| row.get(0),
        )
        .optional()?;
    tx.commit()?;
    Ok(Snapshot {
        cards,
        selected,
        runs,
        artifacts,
        settings_json,
    })
}
