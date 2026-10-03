use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use std::time::SystemTime;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultConnection {
    pub id: String,
    pub root: String,
    pub name: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultEntry {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
    pub is_markdown: bool,
}

#[derive(Clone, Debug, Serialize)]
pub struct VaultLink {
    pub target: String,
    pub kind: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct VaultNote {
    pub path: String,
    pub title: String,
    pub aliases: Vec<String>,
    pub tags: Vec<String>,
    pub links: Vec<VaultLink>,
}

#[derive(Debug, Serialize)]
pub struct VaultSnapshot {
    pub connection: VaultConnection,
    pub entries: Vec<VaultEntry>,
    pub notes: Vec<VaultNote>,
    pub warnings: Vec<String>,
    pub truncated: bool,
}

#[derive(Debug, Serialize)]
pub struct VaultDocument {
    pub path: String,
    pub body: String,
    pub revision: String,
}

#[derive(Clone)]
pub struct CachedNote {
    pub modified: Option<SystemTime>,
    pub length: u64,
    pub note: VaultNote,
    pub warning: Option<String>,
}

#[derive(Default)]
pub struct VaultInner {
    pub loaded: bool,
    pub connection: Option<VaultConnection>,
    pub cache: HashMap<String, CachedNote>,
    pub scanning: bool,
    pub cancel: Arc<AtomicBool>,
}

#[derive(Clone, Default)]
pub struct VaultState(pub Arc<Mutex<VaultInner>>);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgress {
    pub vault_id: String,
    pub entries: usize,
}
