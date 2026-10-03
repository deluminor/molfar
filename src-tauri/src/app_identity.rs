//! The bundle identifier names every per-app directory (app data, WebView
//! storage) and the notification identity. Debug builds get their own so
//! `tauri dev` never reads or writes the installed app's profile.

pub const IDENTIFIER: &str = "com.vatra.desktop";
pub const DEV_IDENTIFIER: &str = "com.vatra.desktop.dev";

pub fn current() -> &'static str {
    if cfg!(debug_assertions) {
        DEV_IDENTIFIER
    } else {
        IDENTIFIER
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
