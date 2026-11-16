use serde::{Deserialize, Serialize};
use std::time::SystemTime;

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultConnection {
    pub id: String,
    pub root: String,
    pub name: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultEntry {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
    pub is_markdown: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct VaultLink {
    pub target: String,
    pub kind: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct VaultNote {
    pub path: String,
    pub title: String,
    pub aliases: Vec<String>,
    pub tags: Vec<String>,
    pub links: Vec<VaultLink>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct VaultSnapshot {
    pub connection: VaultConnection,
    pub entries: Vec<VaultEntry>,
    pub notes: Vec<VaultNote>,
    pub warnings: Vec<String>,
    pub truncated: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct VaultDocument {
    pub path: String,
    pub body: String,
    pub revision: String,
}

#[derive(Clone, Debug)]
pub struct CachedNote {
    pub modified: Option<SystemTime>,
    pub length: u64,
    pub note: VaultNote,
    pub warning: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ConnectionState {
    Empty,
    Ready(VaultConnection),
    Broken(String),
}
