use std::{
    fs,
    io::{self, Read, Write},
    path::{Path, PathBuf},
    sync::Mutex,
};

use super::model::Row;
use crate::atlassian::Error;

const FRESH_MS: i64 = 5 * 60 * 1000;
const MEDIA_FILE: u64 = 20 * 1024 * 1024;
const MEDIA_SITE: u64 = 200 * 1024 * 1024;
static MEDIA_WRITE: Mutex<()> = Mutex::new(());

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
    account: &str,
    id: &str,
    bytes: &[u8],
) -> Result<Option<std::path::PathBuf>, Error> {
    if !valid_media_id(id) {
        return Err(Error::Invalid("Invalid Jira attachment".into()));
    }
    if bytes.len() as u64 > MEDIA_FILE {
        return Ok(None);
    }
    let _guard = MEDIA_WRITE.lock().map_err(storage)?;
    if directory_size(&site_media_root(app, site))?.saturating_add(bytes.len() as u64) > MEDIA_SITE
    {
        return Ok(None);
    }
    let directory = media_root(app, site, account);
    fs::create_dir_all(&directory).map_err(storage)?;
    let path = directory.join(id);
    let mut file = tempfile::NamedTempFile::new_in(directory).map_err(storage)?;
    file.write_all(bytes).map_err(storage)?;
    file.persist(&path).map_err(storage)?;
    Ok(Some(path))
}

pub fn media_root(app: &Path, site: &str, account: &str) -> PathBuf {
    site_media_root(app, site).join(crate::familiar::files::content_hash(account))
}

fn site_media_root(app: &Path, site: &str) -> PathBuf {
    root(app, site).join("account-media")
}

pub fn valid_media_id(id: &str) -> bool {
    !id.is_empty()
        && id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
}

pub fn cached_file(directory: &Path, id: &str) -> Option<PathBuf> {
    if !valid_media_id(id) {
        return None;
    }
    let directory = directory.canonicalize().ok()?;
    let path = crate::knowledge::asset_path(&directory, id).ok()?;
    path.is_file().then_some(path)
}

pub fn cached_image(directory: &Path, id: &str) -> Option<PathBuf> {
    let path = cached_file(directory, id)?;
    let file = fs::File::open(&path).ok()?;
    let mut bytes = Vec::new();
    file.take(MEDIA_FILE + 1).read_to_end(&mut bytes).ok()?;
    if bytes.len() as u64 > MEDIA_FILE {
        return None;
    }
    crate::atlassian::decode_image(&bytes)
        .inspect_err(|reason| log::debug!("Jira cached image rejected: {reason}"))
        .ok()?;
    Some(path)
}

pub fn forget_lists(app: &Path, site: &str) -> Result<(), Error> {
    match fs::remove_dir_all(root(app, site).join("lists")) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(storage(error)),
    }
}

pub fn site_media_full(app: &Path, site: &str) -> Result<bool, Error> {
    Ok(directory_size(&site_media_root(app, site))? >= MEDIA_SITE)
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
        let kind = entry.file_type().map_err(storage)?;
        if kind.is_dir() {
            total = total.saturating_add(directory_size(&entry.path())?);
        } else if kind.is_file() {
            total = total.saturating_add(entry.metadata().map_err(storage)?.len());
        }
    }
    Ok(total)
}

fn storage(error: impl std::fmt::Display) -> Error {
    Error::Offline(format!("Jira cache: {error}"))
}
