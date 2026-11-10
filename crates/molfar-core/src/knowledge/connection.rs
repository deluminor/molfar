use super::constants::CONNECTION_FILE;
use super::documents::atomic_write;
use super::types::VaultConnection;
use std::path::Path;

pub fn read(data_dir: &Path) -> Result<Option<VaultConnection>, String> {
    let file = data_dir.join(CONNECTION_FILE);
    match std::fs::read(&file) {
        Ok(bytes) => serde_json::from_slice(&bytes)
            .map(Some)
            .map_err(|error| format!("Invalid saved vault connection: {error}")),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("Cannot restore vault connection: {error}")),
    }
}

pub fn persist(data_dir: &Path, connection: Option<&VaultConnection>) -> Result<(), String> {
    std::fs::create_dir_all(data_dir).map_err(|error| error.to_string())?;
    let file = data_dir.join(CONNECTION_FILE);
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
