mod assets;
mod constants;
mod documents;
mod parse;
mod paths;
mod scan;
mod state;
pub mod types;

use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{Emitter, State};
use types::{ScanProgress, VaultConnection, VaultDocument, VaultSnapshot, VaultState};

#[tauri::command(async)]
pub fn vault_status(
    app: tauri::AppHandle,
    state: State<'_, VaultState>,
) -> Result<Option<VaultConnection>, String> {
    let mut inner = state::lock(&state)?;
    state::load(&app, &mut inner)?;

    Ok(inner.connection.clone())
}

#[tauri::command(async)]
pub fn vault_connect(
    app: tauri::AppHandle,
    state: State<'_, VaultState>,
    path: String,
) -> Result<VaultConnection, String> {
    let root = paths::validate_root(&crate::fs::expand_home(&path))?;
    let connection = VaultConnection {
        id: uuid::Uuid::new_v4().to_string(),
        name: root
            .file_name()
            .unwrap_or(root.as_os_str())
            .to_string_lossy()
            .into_owned(),
        root: crate::fs::path_to_js(&root),
    };
    let mut inner = state::lock(&state)?;
    if let Some(old) = &inner.connection {
        assets::clear(&app, &old.id)?;
    }
    state::persist(&app, Some(&connection))?;
    inner.cancel.store(true, Ordering::Relaxed);
    inner.connection = Some(connection.clone());
    inner.cache.clear();
    inner.loaded = true;
    inner.scanning = false;
    drop(inner);
    announce_connection(&app, Some(&connection));

    Ok(connection)
}

#[tauri::command]
pub async fn vault_scan(
    app: tauri::AppHandle,
    state: State<'_, VaultState>,
    vault_id: String,
) -> Result<VaultSnapshot, String> {
    let host = state.inner().clone();
    let (connection, mut cache, cancel) = {
        let mut inner = state::lock(&host)?;
        let connection = state::connection(&inner, &vault_id)?;
        if inner.scanning {
            return Err("A vault scan is already running.".into());
        }
        inner.scanning = true;
        inner.cancel = Arc::new(AtomicBool::new(false));
        (
            connection,
            std::mem::take(&mut inner.cache),
            inner.cancel.clone(),
        )
    };
    tauri::async_runtime::spawn_blocking(move || {
        let result = scan::scan(connection, &mut cache, &cancel, |entries| {
            if let Err(error) = app.emit(
                "knowledge:scan-progress",
                ScanProgress {
                    vault_id: vault_id.clone(),
                    entries,
                },
            ) {
                eprintln!("knowledge scan progress {vault_id}: {error}");
            }
        });
        let mut inner = state::lock(&host)?;
        state::connection(&inner, &vault_id)?;
        inner.scanning = false;
        inner.cache = cache;

        result
    })
    .await
    .map_err(|error| format!("Vault scan failed: {error}"))?
}

#[tauri::command]
pub fn vault_cancel_scan(state: State<'_, VaultState>, vault_id: String) -> Result<(), String> {
    let inner = state::lock(&state)?;
    state::connection(&inner, &vault_id)?;
    inner.cancel.store(true, Ordering::Relaxed);

    Ok(())
}

#[tauri::command(async)]
pub fn vault_read(
    state: State<'_, VaultState>,
    vault_id: String,
    path: String,
) -> Result<VaultDocument, String> {
    let inner = state::lock(&state)?;
    let connection = state::connection(&inner, &vault_id)?;

    documents::read(Path::new(&connection.root), &path)
}

#[tauri::command(async)]
pub fn vault_save(
    state: State<'_, VaultState>,
    vault_id: String,
    path: String,
    body: String,
    revision: String,
) -> Result<VaultDocument, String> {
    let mut inner = state::lock(&state)?;
    let connection = state::connection(&inner, &vault_id)?;
    let document = documents::save(Path::new(&connection.root), &path, &body, &revision)?;
    inner.cache.remove(&path);

    Ok(document)
}

#[tauri::command(async)]
pub fn vault_disconnect(
    app: tauri::AppHandle,
    state: State<'_, VaultState>,
    vault_id: String,
) -> Result<(), String> {
    let mut inner = state::lock(&state)?;
    state::connection(&inner, &vault_id)?;
    assets::clear(&app, &vault_id)?;
    state::persist(&app, None)?;
    inner.cancel.store(true, Ordering::Relaxed);
    inner.connection = None;
    inner.cache.clear();
    inner.scanning = false;
    drop(inner);
    announce_connection(&app, None);

    Ok(())
}

fn announce_connection(app: &tauri::AppHandle, connection: Option<&VaultConnection>) {
    if let Err(error) = app.emit(constants::CONNECTION_EVENT, connection) {
        eprintln!("knowledge connection change: {error}");
    }
}

#[tauri::command(async)]
pub fn vault_asset_path(
    app: tauri::AppHandle,
    state: State<'_, VaultState>,
    vault_id: String,
    path: String,
) -> Result<String, String> {
    let inner = state::lock(&state)?;
    let connection = state::connection(&inner, &vault_id)?;

    assets::asset(&app, &connection, &path)
}

#[cfg(test)]
mod tests;

#[cfg(test)]
mod lifecycle_tests;
