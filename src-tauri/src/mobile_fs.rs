//! The phone's file browser: folders and text files inside a project's working copy.

use std::path::PathBuf;

use crate::fs::list::{list_dir_sync, DirEntry};
use crate::fs::read::read_text_file_sync;
use crate::fs::{expand_home, path_to_js};

/// A path a paired phone named under a project's working copy, refused when it
/// resolves outside it, through `..` or a symlink alike.
fn inside_root(root: &str, relative: &str) -> Result<PathBuf, String> {
    let root = expand_home(root)
        .canonicalize()
        .map_err(|_| "Project folder is unavailable".to_string())?;
    let path = root
        .join(relative)
        .canonicalize()
        .map_err(|_| "No such file or folder".to_string())?;
    if !path.starts_with(&root) {
        return Err("That is outside the project".into());
    }
    Ok(path)
}

/// A folder in a project's working copy, for the phone's file browser. Hides
/// the repository's own `.git`.
#[tauri::command(async)]
pub fn mobile_list_dir(root: String, relative: String) -> Result<Vec<DirEntry>, String> {
    let dir = inside_root(&root, &relative)?;
    Ok(list_dir_sync(&dir)?
        .into_iter()
        .filter(|entry| entry.name != ".git")
        .collect())
}

/// A text file in a project's working copy, for the phone's file browser.
#[tauri::command]
pub async fn mobile_read_text_file(root: String, relative: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        read_text_file_sync(&path_to_js(&inside_root(&root, &relative)?))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn inside_root_refuses_paths_that_leave_the_project() {
        let dir = std::env::temp_dir().join(format!(
            "molfar-mobile-inside-root-{}",
            uuid::Uuid::new_v4()
        ));
        let project = dir.join("project");
        std::fs::create_dir_all(project.join("src")).unwrap();
        std::fs::write(project.join("src/main.rs"), "fn main() {}").unwrap();
        std::fs::write(dir.join("secret"), "").unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(dir.join("secret"), project.join("link")).unwrap();
        let root = project.to_string_lossy();

        assert!(inside_root(&root, "src/main.rs").is_ok());
        assert!(inside_root(&root, "").is_ok());
        assert!(inside_root(&root, "../secret").is_err());
        assert!(inside_root(&root, &dir.join("secret").to_string_lossy()).is_err());
        #[cfg(unix)]
        assert!(inside_root(&root, "link").is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
