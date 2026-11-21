use std::{fs, io, path::Path};

use super::model::Row;
use crate::atlassian::Error;

const FRESH_MS: i64 = 5 * 60 * 1000;
const MEDIA_FILE: u64 = 20 * 1024 * 1024;
const MEDIA_SITE: u64 = 200 * 1024 * 1024;

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct CachedList {
    pub fetched_ms: i64,
    pub rows: Vec<Row>,
    #[serde(default)]
    pub adf: Vec<(String, serde_json::Value)>,
}

pub fn host(site: &str) -> String {
    site.trim()
        .trim_start_matches("https://")
        .trim_start_matches("http://")
        .trim_end_matches('/')
        .to_ascii_lowercase()
}

pub fn load_list(
    app: &Path,
    site: &str,
    query: &str,
    now_ms: i64,
) -> Result<Option<CachedList>, Error> {
    let path = list_path(app, site, query);
    let raw = match fs::read_to_string(&path) {
        Ok(raw) => raw,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(storage(error)),
    };
    let cached: CachedList = match serde_json::from_str(&raw) {
        Ok(cached) => cached,
        Err(_) => return Ok(None),
    };
    Ok((now_ms.saturating_sub(cached.fetched_ms) < FRESH_MS).then_some(cached))
}

pub fn save_list(app: &Path, site: &str, query: &str, cached: &CachedList) -> Result<(), Error> {
    let path = list_path(app, site, query);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(storage)?;
    }
    let raw = serde_json::to_string(cached)
        .map_err(|_| Error::Offline("Could not store the Jira list".into()))?;
    fs::write(path, raw).map_err(storage)
}

pub fn store_media(
    app: &Path,
    site: &str,
    id: &str,
    bytes: &[u8],
) -> Result<Option<std::path::PathBuf>, Error> {
    if id.is_empty()
        || !id
            .chars()
            .all(|char| char.is_ascii_alphanumeric() || matches!(char, '-' | '_'))
    {
        return Err(Error::Invalid("Invalid Jira attachment".into()));
    }
    if bytes.len() as u64 > MEDIA_FILE {
        return Ok(None);
    }
    let directory = root(app, site).join("media");
    if directory_size(&directory)?.saturating_add(bytes.len() as u64) > MEDIA_SITE {
        return Ok(None);
    }
    fs::create_dir_all(&directory).map_err(storage)?;
    let path = directory.join(id);
    fs::write(&path, bytes).map_err(storage)?;
    Ok(Some(path))
}

pub fn remove_site(app: &Path, site: &str) -> Result<(), Error> {
    match fs::remove_dir_all(root(app, site)) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(storage(error)),
    }
}

fn list_path(app: &Path, site: &str, query: &str) -> std::path::PathBuf {
    root(app, site).join("lists").join(format!(
        "{}.json",
        crate::familiar::files::content_hash(query)
    ))
}

fn root(app: &Path, site: &str) -> std::path::PathBuf {
    app.join("jira-cache").join(host(site))
}

fn directory_size(directory: &Path) -> Result<u64, Error> {
    if !directory.exists() {
        return Ok(0);
    }
    let mut total: u64 = 0;
    for entry in fs::read_dir(directory).map_err(storage)? {
        let entry = entry.map_err(storage)?;
        total = total.saturating_add(entry.metadata().map_err(storage)?.len());
    }
    Ok(total)
}

fn storage(error: impl std::fmt::Display) -> Error {
    Error::Offline(format!("Jira cache: {error}"))
}
