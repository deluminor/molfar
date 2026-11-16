use std::process::Command;

use crate::fs::expand_home;

#[tauri::command]
pub async fn reveal_path(path: String) -> Result<(), String> {
    // On Linux `xdg-open` can stay alive until the file manager window closes;
    // waiting on it from the main thread hangs the UI.
    tauri::async_runtime::spawn_blocking(move || reveal_path_sync(&path))
        .await
        .map_err(|e| e.to_string())?
}

fn reveal_path_sync(path: &str) -> Result<(), String> {
    let path = expand_home(path);
    if !path.exists() {
        return Err(format!("{}: No such file or directory", path.display()));
    }
    #[cfg(target_os = "macos")]
    {
        let path_str = path.to_str().ok_or_else(|| "Invalid path".to_string())?;
        let status = Command::new("open")
            .args(["-R", path_str])
            .status()
            .map_err(|e| e.to_string())?;
        if !status.success() {
            return Err("Could not reveal in Finder.".into());
        }
        Ok(())
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        // explorer.exe returns 1 even when it opened the folder.
        let path_str = path.to_string_lossy().replace('/', "\\");
        // `.arg` would wrap the whole `/select,...` switch in quotes when the
        // path has spaces; explorer ignores a quoted switch and opens its
        // default folder instead. Only the path itself may be quoted.
        Command::new("explorer")
            .raw_arg(format!("/select,\"{path_str}\""))
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let parent = path
            .parent()
            .ok_or_else(|| "File has no parent directory.".to_string())?;
        let status = Command::new("xdg-open")
            .arg(parent)
            .status()
            .map_err(|e| e.to_string())?;
        if !status.success() {
            return Err("Could not open the containing folder.".into());
        }
        Ok(())
    }
}

#[tauri::command]
pub async fn open_path_with_default_app(path: String) -> Result<(), String> {
    // The Tauri opener command needs a static path scope, and its detached
    // launcher cannot report a failing `open` process back to the UI.
    tauri::async_runtime::spawn_blocking(move || {
        let path = expand_home(&path);
        if !path.is_absolute() {
            return Err("Expected an absolute file path".to_string());
        }
        std::fs::metadata(&path).map_err(|error| format!("{}: {error}", path.display()))?;
        open::that(&path).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}
