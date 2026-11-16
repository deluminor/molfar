use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Manager};
use uuid::Uuid;

use crate::fs::MAX_ATTACHMENT_EMBED_BYTES;

const MAX_GENERATED_IMAGE_BYTES: u64 = 25 * 1024 * 1024;
const MAX_GENERATED_IMAGE_DATA_BYTES: u64 = MAX_GENERATED_IMAGE_BYTES * 4 / 3 + 4;
const GENERATED_IMAGE_DIR: &str = "generated-images";

#[derive(Serialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedImageAsset {
    path: String,
    mime_type: String,
    size: u64,
}

/// Persist a pasted blob so non-image attachments have a real path.
#[tauri::command]
pub async fn write_attachment(name: String, data: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || write_attachment_sync(&name, &data))
        .await
        .map_err(|e| e.to_string())?
}

fn write_attachment_sync(name: &str, data: &str) -> Result<String, String> {
    let bytes = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, data)
        .map_err(|_| "Attachment data is not valid base64.".to_string())?;
    if bytes.len() as u64 > MAX_ATTACHMENT_EMBED_BYTES {
        return Err(format!(
            "File is too large to attach (maximum {} MB).",
            MAX_ATTACHMENT_EMBED_BYTES / 1024 / 1024
        ));
    }
    let dir = std::env::temp_dir().join("molfar-attachments");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let path = dir.join(format!(
        "{}-{}-{}",
        std::process::id(),
        stamp,
        safe_attachment_name(name)
    ));
    // A pasted screenshot can be a picture of whatever was on screen, so keep
    // it owner-only rather than at the umask default of 0644 in a shared /tmp.
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    options
        .open(&path)
        .and_then(|mut file| file.write_all(&bytes))
        .map_err(|e| format!("{}: {e}", path.display()))?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn save_generated_image(
    app: AppHandle,
    data: String,
    name: String,
) -> Result<GeneratedImageAsset, String> {
    tauri::async_runtime::spawn_blocking(move || save_generated_image_sync(&app, &data, &name))
        .await
        .map_err(|e| e.to_string())?
}

fn save_generated_image_sync(
    app: &AppHandle,
    data: &str,
    name: &str,
) -> Result<GeneratedImageAsset, String> {
    if data.len() as u64 > MAX_GENERATED_IMAGE_DATA_BYTES {
        return Err(format!(
            "Generated image is too large (maximum {} MB).",
            MAX_GENERATED_IMAGE_BYTES / 1024 / 1024
        ));
    }
    let encoded: String = data
        .chars()
        .filter(|ch| !ch.is_ascii_whitespace())
        .collect();
    let bytes = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, encoded)
        .map_err(|_| "Generated image data is not valid base64.".to_string())?;
    if bytes.is_empty() || bytes.len() as u64 > MAX_GENERATED_IMAGE_BYTES {
        return Err(format!(
            "Generated image is too large (maximum {} MB).",
            MAX_GENERATED_IMAGE_BYTES / 1024 / 1024
        ));
    }
    if !is_png(&bytes) {
        return Err("Generated image data is not a PNG image.".into());
    }
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join(GENERATED_IMAGE_DIR);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let safe_name = safe_attachment_name(name);
    let destination = dir.join(format!("{}-{}.png", Uuid::new_v4(), safe_name));
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&destination)
        .map_err(|e| format!("{}: {e}", destination.display()))?;
    if let Err(error) = file.write_all(&bytes) {
        let _ = std::fs::remove_file(&destination);
        return Err(format!("{}: {error}", destination.display()));
    }
    Ok(GeneratedImageAsset {
        path: destination.to_string_lossy().into_owned(),
        mime_type: "image/png".into(),
        size: bytes.len() as u64,
    })
}

#[tauri::command]
pub async fn delete_generated_images(app: AppHandle, paths: Vec<String>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || delete_generated_images_sync(&app, &paths))
        .await
        .map_err(|e| e.to_string())?
}

pub(crate) fn delete_generated_images_sync(
    app: &AppHandle,
    paths: &[String],
) -> Result<(), String> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join(GENERATED_IMAGE_DIR)
        .canonicalize()
        .map_err(|error| format!("Generated image directory is unavailable: {error}"))?;
    for path in paths {
        let candidate = match PathBuf::from(path).canonicalize() {
            Ok(candidate) => candidate,
            Err(error) if error.kind() == ErrorKind::NotFound => continue,
            Err(error) => return Err(error.to_string()),
        };
        if !candidate.starts_with(&root) || !candidate.is_file() {
            return Err("Invalid generated image path".into());
        }
        std::fs::remove_file(candidate).map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn is_png(bytes: &[u8]) -> bool {
    bytes.len() >= 8 && bytes.starts_with(&[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
}

fn safe_attachment_name(name: &str) -> String {
    let leaf = Path::new(name)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("attachment");
    let cleaned: String = leaf
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '.' || ch == '-' || ch == '_' {
                ch
            } else {
                '-'
            }
        })
        .collect();
    let trimmed = cleaned.trim_matches('.').trim_matches('-');
    if trimmed.is_empty() {
        "attachment".into()
    } else {
        trimmed.chars().take(80).collect()
    }
}

#[cfg(test)]
mod tests;
