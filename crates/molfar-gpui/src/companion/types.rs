use super::http::Job;
use async_channel::Sender;
use serde::{Deserialize, Serialize};
use std::{
    net::SocketAddr,
    path::PathBuf,
    sync::{Arc, Mutex, Weak, atomic::AtomicBool},
};

pub(crate) const PROTOCOL_VERSION: u32 = 2;
pub(super) const DEFAULT_PORT: u16 = 3775;
pub(super) const PAIR_TTL_MS: u64 = 5 * 60 * 1000;
pub(super) const PAIR_ATTEMPTS: u32 = 5;
pub(super) const PAIR_CODE_LEN: usize = 8;
pub(super) const PAIR_ALPHABET: &[u8] = b"ABCDEFGHJKMNPQRSTUVWXYZ23456789";
pub(super) const DEVICES_MAX: usize = 16;
pub(super) const DEVICE_NAME_MAX: usize = 60;
pub(super) const SEEN_PERSIST_MS: u64 = 60_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum BindMode {
    #[default]
    Serve,
    Tailnet,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Device {
    pub(super) id: String,
    pub(super) name: String,
    pub(super) token_sha256: String,
    pub(super) created_at: u64,
    pub(super) last_seen_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Stored {
    #[serde(default)]
    pub(super) enabled: bool,
    #[serde(default)]
    pub(super) mode: BindMode,
    #[serde(default = "default_port")]
    pub(super) port: u16,
    #[serde(default)]
    pub(super) public_url: Option<String>,
    #[serde(default)]
    pub(super) devices: Vec<Device>,
}

fn default_port() -> u16 {
    DEFAULT_PORT
}

impl Default for Stored {
    fn default() -> Self {
        Self {
            enabled: false,
            mode: BindMode::Serve,
            port: DEFAULT_PORT,
            public_url: None,
            devices: Vec::new(),
        }
    }
}

pub(super) struct Pairing {
    pub(super) code: String,
    pub(super) expires_at: u64,
    pub(super) attempts: u32,
}

pub(super) struct Running {
    pub(super) server: Arc<tiny_http::Server>,
    pub(super) stopped: Arc<AtomicBool>,
    pub(super) addr: SocketAddr,
}

pub(super) struct Inner {
    pub(super) path: PathBuf,
    pub(super) stored: Stored,
    pub(super) pairing: Option<Pairing>,
    pub(super) running: Option<Running>,
    pub(super) draining: Option<(SocketAddr, Weak<tiny_http::Server>)>,
    pub(super) error: Option<String>,
    pub(super) seen_persisted_at: u64,
    pub(super) jobs: Sender<Job>,
    pub(super) discovery: super::discovery::Snapshot,
    pub(super) closed: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct DeviceInfo {
    pub id: String,
    pub name: String,
    pub created_at: u64,
    pub last_seen_at: Option<u64>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct Status {
    pub enabled: bool,
    pub running: bool,
    pub mode: BindMode,
    pub port: u16,
    pub public_url: Option<String>,
    pub effective_url: Option<String>,
    pub listen_addr: Option<String>,
    pub error: Option<String>,
    pub tailscale_ip: Option<String>,
    pub tailscale_dns: Option<String>,
    pub devices: Vec<DeviceInfo>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct Offer {
    pub code: String,
    pub url: String,
    pub link: String,
    pub expires_at: u64,
}

#[derive(Clone)]
pub(crate) struct Host {
    pub(super) inner: Arc<Mutex<Inner>>,
    pub(super) sampler: Arc<Mutex<molfar_core::host::Sampler>>,
}
