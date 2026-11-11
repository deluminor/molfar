use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use types::CachedNote;

mod assets;
mod companion;
mod connection;
mod constants;
mod documents;
mod graph;
mod links;
mod parse;
mod paths;
mod preview;
mod properties;
mod scan;
mod tasks;
mod types;

pub use assets::{asset_path, asset_target, embed_images, find_asset, is_image, ASSET_SCHEME};
pub use companion::{disconnected, shape_index, shape_note};
pub use constants::{BODY_MAX, NOTES_MAX, NOT_IN_VAULT, NO_VAULT};
pub use graph::{
    note_matches, pick, project_graph, settle, Camera, GraphEdge, GraphNode, GraphProjection,
    Point3, Projected, Simulation, DRAG_ALPHA, MAX_DISTANCE, MIN_DISTANCE, SETTLE_TICKS,
    WARM_TICKS,
};
pub use links::{backlinks, decode_component, note_index, resolve_vault_link, LinkResolution};
pub use preview::{prepare_preview, vault_target};
pub use properties::{note_properties, NoteProperty};
pub use tasks::toggle_task;
pub use types::{
    ConnectionState, VaultConnection, VaultDocument, VaultEntry, VaultLink, VaultNote,
    VaultSnapshot,
};

#[derive(Clone)]
pub struct VaultHost {
    inner: Arc<Mutex<Inner>>,
    scans: Arc<AtomicU64>,
    progress: Arc<AtomicU64>,
}

struct Inner {
    state: ConnectionState,
    cache: HashMap<String, CachedNote>,
    cancel: Arc<AtomicBool>,
}

impl Default for VaultHost {
    fn default() -> Self {
        Self::new()
    }
}

impl VaultHost {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(Inner {
                state: ConnectionState::Empty,
                cache: HashMap::new(),
                cancel: Arc::new(AtomicBool::new(false)),
            })),
            scans: Arc::new(AtomicU64::new(0)),
            progress: Arc::new(AtomicU64::new(0)),
        }
    }

    pub fn scans_started(&self) -> u64 {
        self.scans.load(Ordering::Relaxed)
    }

    /// Notes indexed so far by the running scan.
    pub fn scan_progress(&self) -> u64 {
        self.progress.load(Ordering::Relaxed)
    }

    pub fn state(&self) -> Result<ConnectionState, String> {
        Ok(self.lock()?.state.clone())
    }

    pub fn load(&self, data_dir: &Path) -> Result<ConnectionState, String> {
        let state = match connection::read(data_dir) {
            Ok(None) => ConnectionState::Empty,
            Ok(Some(saved)) => match paths::validate_root(Path::new(&saved.root)) {
                Ok(root) => ConnectionState::Ready(VaultConnection {
                    id: uuid::Uuid::new_v4().to_string(),
                    root: root.to_string_lossy().into_owned(),
                    name: saved.name,
                }),
                Err(reason) => ConnectionState::Broken(reason),
            },
            Err(reason) => ConnectionState::Broken(reason),
        };
        let mut inner = self.lock()?;
        inner.cancel.store(true, Ordering::Relaxed);
        inner.cache.clear();
        inner.state = state.clone();
        Ok(state)
    }

    pub fn connect(&self, data_dir: &Path, path: &str) -> Result<VaultConnection, String> {
        let root = paths::validate_root(&paths::expand_home(path))?;
        let name = root
            .file_name()
            .unwrap_or(root.as_os_str())
            .to_string_lossy()
            .into_owned();
        let connection = VaultConnection {
            id: uuid::Uuid::new_v4().to_string(),
            root: root.to_string_lossy().into_owned(),
            name,
        };
        paths::validate_connection_id(&connection.id)?;
        connection::persist(data_dir, Some(&connection))?;
        let mut inner = self.lock()?;
        inner.cancel.store(true, Ordering::Relaxed);
        inner.cache.clear();
        inner.state = ConnectionState::Ready(connection.clone());
        Ok(connection)
    }

    pub fn disconnect(&self, data_dir: &Path) -> Result<(), String> {
        connection::persist(data_dir, None)?;
        let mut inner = self.lock()?;
        inner.cancel.store(true, Ordering::Relaxed);
        inner.cache.clear();
        inner.state = ConnectionState::Empty;
        Ok(())
    }

    pub fn cancel(&self) -> Result<(), String> {
        self.lock()?.cancel.store(true, Ordering::Relaxed);
        Ok(())
    }

    pub fn scan(&self) -> Result<VaultSnapshot, String> {
        let (connection, mut cache, cancel) = {
            let mut inner = self.lock()?;
            let connection = match &inner.state {
                ConnectionState::Ready(connection) => connection.clone(),
                _ => return Err(NO_VAULT.into()),
            };
            inner.cancel = Arc::new(AtomicBool::new(false));
            let cancel = inner.cancel.clone();
            let cache = std::mem::take(&mut inner.cache);
            (connection, cache, cancel)
        };
        self.scans.fetch_add(1, Ordering::Relaxed);
        self.progress.store(0, Ordering::Relaxed);
        let id = connection.id.clone();
        let result = scan::scan(connection, &mut cache, &cancel, &self.progress);
        let mut inner = self.lock()?;
        if matches!(&inner.state, ConnectionState::Ready(current) if current.id == id) {
            inner.cache = cache;
        }
        result
    }

    pub fn read(&self, path: &str) -> Result<VaultDocument, String> {
        let root = self.root()?;
        documents::read(Path::new(&root), path)
    }

    pub fn save(&self, path: &str, body: &str, expected: &str) -> Result<VaultDocument, String> {
        let root = self.root()?;
        let document = documents::save(Path::new(&root), path, body, expected)?;
        self.lock()?.cache.remove(path);
        Ok(document)
    }

    pub fn companion_index(&self) -> Result<serde_json::Value, String> {
        if !matches!(self.state()?, ConnectionState::Ready(_)) {
            return Ok(companion::disconnected());
        }
        Ok(companion::shape_index(&self.scan()?))
    }

    pub fn companion_read(&self, path: &str) -> Result<serde_json::Value, String> {
        self.require_ready()?;
        let snapshot = self.scan()?;
        if !snapshot.notes.iter().any(|note| note.path == path) {
            return Err(NOT_IN_VAULT.into());
        }
        let document = self.read(path)?;
        companion::shape_note(&snapshot, path, &document)
    }

    pub fn companion_write(
        &self,
        path: &str,
        body: &str,
        revision: &str,
    ) -> Result<serde_json::Value, String> {
        self.require_ready()?;
        let snapshot = self.scan()?;
        if !snapshot.notes.iter().any(|note| note.path == path) {
            return Err(NOT_IN_VAULT.into());
        }
        self.save(path, body, revision)?;
        self.companion_read(path)
    }

    fn require_ready(&self) -> Result<(), String> {
        match self.state()? {
            ConnectionState::Ready(_) => Ok(()),
            ConnectionState::Broken(reason) => Err(reason),
            ConnectionState::Empty => Err(NO_VAULT.into()),
        }
    }

    fn root(&self) -> Result<String, String> {
        match self.state()? {
            ConnectionState::Ready(connection) => Ok(connection.root),
            ConnectionState::Broken(reason) => Err(reason),
            ConnectionState::Empty => Err(NO_VAULT.into()),
        }
    }

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, Inner>, String> {
        self.inner
            .lock()
            .map_err(|_| "Vault state is unavailable.".into())
    }
}

pub fn revision_of(body: &[u8]) -> String {
    documents::revision(body)
}

#[cfg(test)]
mod tests;
