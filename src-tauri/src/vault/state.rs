use super::constants::CONNECTION_FILE;
use super::documents::atomic_write;
use super::paths::{validate_connection_id, validate_root};
use super::types::{VaultConnection, VaultInner, VaultState};
use std::path::Path;
use std::sync::MutexGuard;
use tauri::Manager;

pub fn lock(state: &VaultState) -> Result<MutexGuard<'_, VaultInner>, String> {
    state
        .0
        .lock()
        .map_err(|_| "Vault state is unavailable.".into())
}

pub fn load(app: &tauri::AppHandle, inner: &mut VaultInner) -> Result<(), String> {
    if inner.loaded {
        return Ok(());
    }
    let file = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join(CONNECTION_FILE);
    match std::fs::read(&file) {
        Ok(bytes) => {
            let mut connection: VaultConnection = serde_json::from_slice(&bytes)
                .map_err(|error| format!("Invalid saved vault connection: {error}"))?;
            validate_connection_id(&connection.id)?;
            let root = validate_root(Path::new(&connection.root))?;
            super::assets::clear(app, &connection.id)?;
            connection.root = root.to_string_lossy().into_owned();
            connection.id = uuid::Uuid::new_v4().to_string();
            persist(app, Some(&connection))?;
            inner.connection = Some(connection);
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(format!("Cannot restore vault connection: {error}")),
    }
    inner.loaded = true;

    Ok(())
}

pub fn persist(app: &tauri::AppHandle, connection: Option<&VaultConnection>) -> Result<(), String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    std::fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let file = directory.join(CONNECTION_FILE);
    match connection {
        Some(connection) => {
            let bytes = serde_json::to_vec(connection).map_err(|error| error.to_string())?;
            atomic_write(&file, &bytes, || Ok(()))
        }
        None => match std::fs::remove_file(file) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(format!("Cannot forget vault connection: {error}")),
        },
    }
}

pub fn connection(inner: &VaultInner, id: &str) -> Result<VaultConnection, String> {
    inner
        .connection
        .as_ref()
        .filter(|connection| connection.id == id)
        .cloned()
        .ok_or_else(|| "Vault connection changed. Reconnect before continuing.".into())
}
