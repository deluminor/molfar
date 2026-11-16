use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::fs::{expand_home, path_to_js};

#[derive(Serialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectLocation {
    pub(super) path: String,
    pub(super) identity: String,
}

/// Resolve a project by filesystem identity when its directory was renamed.
///
/// A rename preserves the directory identity. We only inspect direct siblings
/// of the missing path, which keeps this bounded and avoids a filesystem watch
/// or a broad disk search.
#[tauri::command(async)]
pub fn resolve_project_location(
    path: String,
    identity: Option<String>,
) -> Result<Option<ProjectLocation>, String> {
    resolve_project_location_sync(&path, identity.as_deref())
}

fn resolve_project_location_sync(
    path: &str,
    identity: Option<&str>,
) -> Result<Option<ProjectLocation>, String> {
    let path = expand_home(path);
    if path.is_dir() {
        let identity = directory_identity(&path)?;
        return Ok(Some(ProjectLocation {
            path: path_to_js(&path),
            identity,
        }));
    }

    let Some(identity) = identity.filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    let Some(parent) = path.parent() else {
        return Ok(None);
    };
    let entries = match std::fs::read_dir(parent) {
        Ok(entries) => entries,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.to_string()),
    };
    for entry in entries.flatten() {
        let candidate = entry.path();
        if !candidate.is_dir() {
            continue;
        }
        let Ok(candidate_identity) = directory_identity(&candidate) else {
            continue;
        };
        if candidate_identity == identity {
            return Ok(Some(ProjectLocation {
                path: path_to_js(&candidate),
                identity: candidate_identity,
            }));
        }
    }
    Ok(None)
}

#[cfg(unix)]
fn directory_identity(path: &Path) -> Result<String, String> {
    use std::os::unix::fs::MetadataExt;

    let metadata = std::fs::metadata(path).map_err(|error| error.to_string())?;
    Ok(format!("unix:{}:{}", metadata.dev(), metadata.ino()))
}

#[cfg(windows)]
fn directory_identity(path: &Path) -> Result<String, String> {
    use std::fs::OpenOptions;
    use std::os::windows::fs::OpenOptionsExt;
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::Storage::FileSystem::{
        GetFileInformationByHandle, BY_HANDLE_FILE_INFORMATION, FILE_FLAG_BACKUP_SEMANTICS,
    };

    let file = OpenOptions::new()
        .read(true)
        .custom_flags(FILE_FLAG_BACKUP_SEMANTICS)
        .open(path)
        .map_err(|error| error.to_string())?;
    let mut info = BY_HANDLE_FILE_INFORMATION::default();
    let succeeded = unsafe {
        GetFileInformationByHandle(file.as_raw_handle() as _, std::ptr::addr_of_mut!(info))
    };
    if succeeded == 0 {
        return Err(std::io::Error::last_os_error().to_string());
    }
    let file_index = (u64::from(info.nFileIndexHigh) << 32) | u64::from(info.nFileIndexLow);
    Ok(format!(
        "windows:{}:{file_index}",
        info.dwVolumeSerialNumber
    ))
}

pub(super) fn project_root(start: &Path) -> PathBuf {
    let mut dir = start;
    loop {
        if dir.join(".git").exists() || dir.join(".gitignore").exists() {
            return dir.to_path_buf();
        }
        match dir.parent() {
            Some(parent) => dir = parent,
            None => return start.to_path_buf(),
        }
    }
}

#[cfg(test)]
mod tests;
