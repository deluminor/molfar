use super::constants::{IMAGE_EXTENSIONS, MAX_ASSET_BYTES};
use super::documents::{atomic_write, revision};
use super::paths;
use super::types::VaultConnection;
use std::io::Read;
use std::path::{Path, PathBuf};
use tauri::Manager;

fn cache_root(app: &tauri::AppHandle, id: &str) -> Result<PathBuf, String> {
    paths::validate_connection_id(id)?;
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("knowledge-assets")
        .join(id))
}

pub fn clear(app: &tauri::AppHandle, id: &str) -> Result<(), String> {
    let directory = cache_root(app, id)?;
    match std::fs::remove_dir_all(directory) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("Cannot remove vault image cache: {error}")),
    }
}

pub fn asset(
    app: &tauri::AppHandle,
    connection: &VaultConnection,
    path: &str,
) -> Result<String, String> {
    let root = Path::new(&connection.root);
    let source = paths::resolve(root, path)?;
    let extension = source
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !IMAGE_EXTENSIONS.contains(&extension.as_str()) {
        return Err("Only supported local images can be previewed.".into());
    }
    let mut options = std::fs::OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
    }
    let file = options.open(&source).map_err(|error| error.to_string())?;
    let metadata = file.metadata().map_err(|error| error.to_string())?;
    if !metadata.is_file() || metadata.len() > MAX_ASSET_BYTES {
        return Err("Image must be a regular file below 20 MiB.".into());
    }
    let mut bytes = Vec::new();
    file.take(MAX_ASSET_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    if bytes.len() as u64 > MAX_ASSET_BYTES {
        return Err("Image exceeds 20 MiB.".into());
    }
    let directory = cache_root(app, &connection.id)?;
    std::fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let destination = directory.join(format!("{}.{}", revision(path.as_bytes()), extension));
    atomic_write(&destination, &bytes, || {
        paths::resolve(root, path)?;
        Ok(())
    })?;

    Ok(crate::fs::path_to_js(&destination))
}
