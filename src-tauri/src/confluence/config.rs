use std::fs;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use super::types::{AtlassianConfig, ConfluenceStatus};

pub(super) fn status_for(config: Option<&AtlassianConfig>) -> ConfluenceStatus {
    ConfluenceStatus {
        connected: config.is_some(),
        site: config.map(|c| c.site.clone()).unwrap_or_default(),
        email: config.map(|c| c.email.clone()).unwrap_or_default(),
    }
}

pub(super) fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("jira-config.json"))
}

pub(super) fn normalize_site(raw: &str) -> Result<String, String> {
    let raw = raw.trim().trim_end_matches('/');
    if raw.is_empty() {
        return Err("Connect Jira in Settings".into());
    }
    let with_scheme = if raw.contains("://") {
        raw.to_string()
    } else if raw.contains('.') {
        format!("https://{raw}")
    } else {
        format!("https://{raw}.atlassian.net")
    };
    let url = url::Url::parse(&with_scheme).map_err(|_| "Jira site is invalid".to_string())?;
    if url.scheme() != "https" {
        return Err("Jira site must use HTTPS".into());
    }
    let host = url
        .host_str()
        .filter(|host| !host.is_empty())
        .ok_or_else(|| "Jira site is invalid".to_string())?;
    Ok(match url.port() {
        Some(port) => format!("https://{}:{port}", host.to_ascii_lowercase()),
        None => format!("https://{}", host.to_ascii_lowercase()),
    })
}

pub(super) fn read_config(app: &AppHandle) -> Result<Option<AtlassianConfig>, String> {
    let path = config_path(app)?;
    match fs::read_to_string(path) {
        Ok(raw) => {
            let mut config: AtlassianConfig =
                serde_json::from_str(&raw).map_err(|_| "Jira settings are invalid".to_string())?;
            config.site = normalize_site(&config.site)?;
            config.email = config.email.trim().to_string();
            config.token = config.token.trim().to_string();
            if config.token.is_empty() || config.email.is_empty() {
                Ok(None)
            } else {
                Ok(Some(config))
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

pub(super) fn require_config(app: &AppHandle) -> Result<AtlassianConfig, String> {
    read_config(app)?.ok_or_else(|| "Connect Jira in Settings to use Confluence".to_string())
}
