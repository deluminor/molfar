//! The bundle identifier names every per-app directory (app data, WebView
//! storage) and the notification identity. Debug builds get their own so
//! `tauri dev` never reads or writes the installed app's profile.

use std::path::PathBuf;

pub const IDENTIFIER: &str = "com.molfar.desktop";
pub const DEV_IDENTIFIER: &str = "com.molfar.desktop.dev";

pub fn current() -> &'static str {
    if cfg!(debug_assertions) {
        DEV_IDENTIFIER
    } else {
        IDENTIFIER
    }
}

/// App data directory matching Tauri's `app_data_dir` for this identifier.
/// Used by CLI modes (connectors-mcp) that run without an `AppHandle`.
pub fn app_data_dir() -> Result<PathBuf, String> {
    let home = crate::dirs_home().ok_or_else(|| "Home directory not found".to_string())?;
    let id = current();
    #[cfg(target_os = "macos")]
    {
        Ok(PathBuf::from(home)
            .join("Library/Application Support")
            .join(id))
    }
    #[cfg(target_os = "windows")]
    {
        let base = std::env::var_os("APPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from(home).join("AppData/Roaming"));
        Ok(base.join(id))
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Ok(PathBuf::from(home).join(".local/share").join(id))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identifier_matches_the_tauri_config() {
        let config: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();

        assert_eq!(config["identifier"], IDENTIFIER);
    }

    #[cfg(debug_assertions)]
    #[test]
    fn debug_builds_use_the_dev_identity() {
        assert_eq!(current(), DEV_IDENTIFIER);
        assert_ne!(DEV_IDENTIFIER, IDENTIFIER);
    }
}
