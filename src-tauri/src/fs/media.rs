use std::io::Read;
use std::path::Path;

use tauri::{AppHandle, Manager};

use crate::fs::{expand_home, MAX_PREVIEW_BYTES};

const MAX_DOCUMENT_IMAGE_BYTES: u64 = 20 * 1024 * 1024;
/// Video containers the chat can stream; mirrors `VIDEO_MIME_TYPES` in the UI.
const STREAMABLE_VIDEO_EXTENSIONS: &[&str] = &[
    "mp4", "m4v", "mov", "webm", "ogv", "avi", "mkv", "mpg", "mpeg", "3gp", "3g2",
];

/// Let the asset protocol serve one local video, so a chat can stream it with
/// range requests instead of reading the whole file into memory. Only that
/// file, and only a video container, joins the scope. Returns the canonical
/// path the caller should load.
#[tauri::command]
pub fn allow_video_stream(app: AppHandle, path: String) -> Result<String, String> {
    let path = expand_home(&path)
        .canonicalize()
        .map_err(|e| e.to_string())?;
    let video = is_streamable_video(&path);
    if !video || !path.is_file() {
        return Err("Not a video file".into());
    }
    app.asset_protocol_scope()
        .allow_file(&path)
        .map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

fn is_streamable_video(path: &std::path::Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| STREAMABLE_VIDEO_EXTENSIONS.contains(&ext.to_ascii_lowercase().as_str()))
}

/// Read a file as raw bytes for the image viewer.
///
/// Returns an `ipc::Response`, which reaches the webview as an ArrayBuffer, so
/// previews skip the 33% base64 inflation that inline attachments pay. The
/// caller decides what the bytes are by sniffing them; this only guards size.
#[tauri::command]
pub async fn read_binary_file(path: String) -> Result<tauri::ipc::Response, String> {
    let bytes = tauri::async_runtime::spawn_blocking(move || read_binary_file_sync(&path))
        .await
        .map_err(|e| e.to_string())??;
    Ok(tauri::ipc::Response::new(bytes))
}

fn read_binary_file_sync(path: &str) -> Result<Vec<u8>, String> {
    let path = expand_home(path);
    let meta = std::fs::metadata(&path).map_err(|e| format!("{}: {e}", path.display()))?;
    if !meta.is_file() {
        return Err("Not a file".into());
    }
    if meta.len() > MAX_PREVIEW_BYTES {
        return Err(format!(
            "File is too large to preview (maximum {} MB).",
            MAX_PREVIEW_BYTES / 1024 / 1024
        ));
    }
    std::fs::read(&path).map_err(|e| format!("{}: {e}", path.display()))
}

/// Read an image that a Markdown document in a project shows.
///
/// The document is untrusted, so `path` must be relative to `root` and the
/// file must resolve inside it with symlinks followed: a README cannot pull in
/// a file from elsewhere on disk. The caller sniffs the bytes, as for
/// `read_binary_file`.
#[tauri::command]
pub async fn read_project_image(
    root: String,
    path: String,
) -> Result<tauri::ipc::Response, String> {
    let bytes = tauri::async_runtime::spawn_blocking(move || {
        read_project_image_sync(Path::new(&root), Path::new(&path))
    })
    .await
    .map_err(|e| e.to_string())??;
    Ok(tauri::ipc::Response::new(bytes))
}

fn read_project_image_sync(root: &Path, path: &Path) -> Result<Vec<u8>, String> {
    use std::path::Component;
    if !path
        .components()
        .all(|part| matches!(part, Component::Normal(_) | Component::CurDir))
    {
        return Err("Image path must stay inside the project".into());
    }
    let root = std::fs::canonicalize(root).map_err(|e| format!("{}: {e}", root.display()))?;
    let joined = root.join(path);
    let file = std::fs::canonicalize(&joined).map_err(|e| format!("{}: {e}", joined.display()))?;
    if !file.starts_with(&root) {
        return Err("Image is outside the project".into());
    }
    let handle = std::fs::File::open(&file).map_err(|e| format!("{}: {e}", file.display()))?;
    let meta = handle
        .metadata()
        .map_err(|e| format!("{}: {e}", file.display()))?;
    if !meta.is_file() {
        return Err("Not a file".into());
    }
    let too_large = || {
        format!(
            "Image is too large to show (maximum {} MB).",
            MAX_DOCUMENT_IMAGE_BYTES / 1024 / 1024
        )
    };
    if meta.len() > MAX_DOCUMENT_IMAGE_BYTES {
        return Err(too_large());
    }
    let mut bytes = Vec::with_capacity(meta.len() as usize);
    handle
        .take(MAX_DOCUMENT_IMAGE_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| format!("{}: {e}", file.display()))?;
    if bytes.len() as u64 > MAX_DOCUMENT_IMAGE_BYTES {
        return Err(too_large());
    }
    Ok(bytes)
}

#[cfg(test)]
mod tests;
