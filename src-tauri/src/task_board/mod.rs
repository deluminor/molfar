//! Task Board persistence: cards, stage runs, versioned artifact files and
//! board settings. The webview owns the pipeline; this module stores state,
//! serializes concurrent writers and claims queue slots atomically.

mod artifacts;
mod cards;
mod claim;
mod materialize;
mod runs;
mod schema;
mod settings;
mod types;
mod validate;

#[cfg(test)]
mod materialize_tests;
#[cfg(test)]
mod tests;

use std::path::PathBuf;

use tauri::{AppHandle, Emitter, Manager, State};

use crate::session_store::{now_millis, SessionStore};
use artifacts::ArtifactWrite;
use materialize::InputRef;
use settings::BoardSettings;
use types::{ArtifactMeta, Card, CardCreate, CardPatch, StageRun, StageRunCreate, StageRunPatch};

pub(crate) use schema::ensure_tables;

const CHANGED: &str = "molfar:task-board-changed";

fn artifact_base(app: &AppHandle) -> Result<PathBuf, String> {
    let data = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    Ok(data.join("task-board"))
}

fn changed(app: &AppHandle) {
    let _ = app.emit(CHANGED, ());
}

#[tauri::command(async)]
pub fn task_board_cards_list(
    store: State<'_, SessionStore>,
    project: Option<String>,
    archived: bool,
) -> Result<Vec<Card>, String> {
    cards::list(&*store.lock_conn()?, project.as_deref(), archived)
}

#[tauri::command(async)]
pub fn task_board_card_get(
    store: State<'_, SessionStore>,
    id: String,
) -> Result<Option<Card>, String> {
    cards::get(&*store.lock_conn()?, &id)
}

#[tauri::command(async)]
pub fn task_board_card_create(
    app: AppHandle,
    store: State<'_, SessionStore>,
    card: CardCreate,
) -> Result<Card, String> {
    let created = cards::create(&mut *store.lock_conn()?, &card, now_millis())?;
    changed(&app);
    Ok(created)
}

#[tauri::command(async)]
pub fn task_board_card_update(
    app: AppHandle,
    store: State<'_, SessionStore>,
    id: String,
    expected_updated_at: i64,
    patch: CardPatch,
) -> Result<Card, String> {
    let updated = cards::update(
        &mut *store.lock_conn()?,
        &id,
        expected_updated_at,
        &patch,
        now_millis(),
    )?;
    changed(&app);
    Ok(updated)
}

#[tauri::command(async)]
pub fn task_board_card_delete(
    app: AppHandle,
    store: State<'_, SessionStore>,
    id: String,
) -> Result<(), String> {
    cards::delete_archived(&*store.lock_conn()?, &id)?;
    artifacts::remove_card_dir(&artifact_base(&app)?, &id)?;
    changed(&app);
    Ok(())
}

#[tauri::command(async)]
pub fn task_board_claim_next(
    app: AppHandle,
    store: State<'_, SessionStore>,
) -> Result<Option<Card>, String> {
    let mut conn = store.lock_conn()?;
    let limit = settings::get(&conn)?.max_concurrent_stages;
    let claimed = claim::claim_next(&mut conn, limit, now_millis())?;
    drop(conn);
    if claimed.is_some() {
        changed(&app);
    }
    Ok(claimed)
}

#[tauri::command(async)]
pub fn task_board_runs_list(
    store: State<'_, SessionStore>,
    card_id: String,
) -> Result<Vec<StageRun>, String> {
    runs::list(&*store.lock_conn()?, &card_id)
}

#[tauri::command(async)]
pub fn task_board_runs_running(store: State<'_, SessionStore>) -> Result<Vec<StageRun>, String> {
    runs::list_running(&*store.lock_conn()?)
}

#[tauri::command(async)]
pub fn task_board_run_create(
    app: AppHandle,
    store: State<'_, SessionStore>,
    run: StageRunCreate,
) -> Result<StageRun, String> {
    let created = runs::create(&mut *store.lock_conn()?, &run, now_millis())?;
    changed(&app);
    Ok(created)
}

#[tauri::command(async)]
pub fn task_board_run_update(
    app: AppHandle,
    store: State<'_, SessionStore>,
    id: String,
    patch: StageRunPatch,
) -> Result<StageRun, String> {
    let updated = runs::update(&*store.lock_conn()?, &id, &patch, now_millis())?;
    changed(&app);
    Ok(updated)
}

#[tauri::command(async)]
pub fn task_board_artifacts_list(
    store: State<'_, SessionStore>,
    card_id: String,
) -> Result<Vec<ArtifactMeta>, String> {
    artifacts::list(&*store.lock_conn()?, &card_id)
}

#[tauri::command(async)]
pub fn task_board_artifact_read(
    app: AppHandle,
    store: State<'_, SessionStore>,
    card_id: String,
    kind: String,
    version: i64,
) -> Result<String, String> {
    let base = artifact_base(&app)?;
    artifacts::read(&*store.lock_conn()?, &base, &card_id, &kind, version)
}

#[tauri::command(async)]
pub fn task_board_artifact_write(
    app: AppHandle,
    store: State<'_, SessionStore>,
    card_id: String,
    kind: String,
    source: String,
    stage_run_id: Option<String>,
    body: String,
) -> Result<ArtifactMeta, String> {
    let base = artifact_base(&app)?;
    let input = ArtifactWrite {
        card_id: &card_id,
        kind: &kind,
        source: &source,
        stage_run_id: stage_run_id.as_deref(),
        body: &body,
    };
    let meta = artifacts::write(&mut *store.lock_conn()?, &base, &input, now_millis())?;
    changed(&app);
    Ok(meta)
}

/// Copies stage inputs into the card's worktree so the session reads them as files.
#[tauri::command(async)]
pub fn task_board_inputs_materialize(
    app: AppHandle,
    store: State<'_, SessionStore>,
    card_id: String,
    inputs: Vec<InputRef>,
) -> Result<Vec<String>, String> {
    let base = artifact_base(&app)?;
    let prepared = materialize::prepare(&*store.lock_conn()?, &base, &card_id, &inputs)?;
    materialize::write(&prepared)
}

#[tauri::command(async)]
pub fn task_board_settings_get(store: State<'_, SessionStore>) -> Result<BoardSettings, String> {
    settings::get(&*store.lock_conn()?)
}

#[tauri::command(async)]
pub fn task_board_settings_set(
    app: AppHandle,
    store: State<'_, SessionStore>,
    settings: BoardSettings,
) -> Result<BoardSettings, String> {
    let saved = settings::set(&*store.lock_conn()?, &settings)?;
    changed(&app);
    Ok(saved)
}
