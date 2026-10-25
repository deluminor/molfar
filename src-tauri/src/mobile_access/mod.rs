//! A paired phone controls the workspace through its owning app window.
//! No arbitrary Tauri commands or direct session database writes are exposed.

mod catalog;
pub mod commands;
mod handle;
#[cfg(test)]
mod tests;
mod watch;

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use catalog::*;
pub(crate) use handle::*;
use molfar_mobile_link::{now, Address, Gate, Identity, PORT, VERSION};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};
use tokio::sync::oneshot;
use watch::*;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Device {
    id: String,
    name: String,
    fingerprint: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Config {
    enabled: bool,
    #[serde(default)]
    open_router: bool,
    #[serde(default)]
    remote_address: String,
    #[serde(default)]
    devices: Vec<Device>,
}
impl Default for Config {
    fn default() -> Self {
        Self {
            enabled: false,
            open_router: true,
            remote_address: String::new(),
            devices: Vec::new(),
        }
    }
}
struct Invitation {
    expires: u64,
}
struct Pending {
    window: String,
    reply: oneshot::Sender<Value>,
}
/// A phone watching a conversation through the window that owns it.
struct Watcher {
    window: String,
    peer: String,
    sink: molfar_mobile_link::WatchSink,
}
struct Inner {
    watches: HashMap<String, Watcher>,
    config: Config,
    identity: Option<Identity>,
    endpoint: Option<quinn::Endpoint>,
    invitations: HashMap<String, Invitation>,
    catalogs: HashMap<String, Value>,
    pending: HashMap<String, Pending>,
    router_address: Option<Address>,
    router_status: String,
    router_started: bool,
}
#[derive(Clone)]
pub struct MobileHost {
    inner: Arc<Mutex<Inner>>,
    gate: Gate,
    path: PathBuf,
}
pub fn init(app: &AppHandle) -> Result<(), String> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("mobile-access.json");
    let config: Config = if path.exists() {
        serde_json::from_slice(&std::fs::read(&path).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?
    } else {
        Config::default()
    };
    let enabled = config.enabled;
    let gate = Gate::default();
    for device in &config.devices {
        gate.allow(device.fingerprint.clone(), None);
    }
    let host = MobileHost {
        inner: Arc::new(Mutex::new(Inner {
            config,
            identity: None,
            endpoint: None,
            invitations: HashMap::new(),
            catalogs: HashMap::new(),
            pending: HashMap::new(),
            watches: HashMap::new(),
            router_address: None,
            router_status: "Off".into(),
            router_started: false,
        })),
        gate,
        path,
    };
    app.manage(host.clone());
    if enabled {
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            if let Err(error) = start(&app, &host).await {
                host.inner.lock().unwrap().router_status = error;
            }
        });
    }
    Ok(())
}
fn save(host: &MobileHost, config: &Config) -> Result<(), String> {
    let parent = host.path.parent().ok_or("Invalid mobile settings path")?;
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let temporary = parent.join(format!(".mobile-access-{}.json", uuid::Uuid::new_v4()));
    std::fs::write(
        &temporary,
        serde_json::to_vec(config).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    std::fs::rename(&temporary, &host.path).map_err(|e| e.to_string())
}
fn identity(host: &MobileHost) -> Result<Identity, String> {
    let mut inner = host
        .inner
        .lock()
        .map_err(|_| "Mobile service unavailable")?;
    if let Some(identity) = &inner.identity {
        return Ok(identity.clone());
    }
    let account = format!("desktop:{}", host.path.display());
    let entry = keyring::Entry::new("com.molfar.mobile", &account).map_err(|e| e.to_string())?;
    let identity = match entry.get_password() {
        Ok(value) => {
            serde_json::from_str(&value).map_err(|_| "Saved desktop mobile identity is invalid")?
        }
        Err(keyring::Error::NoEntry) => {
            if !inner.config.devices.is_empty() {
                return Err("Desktop mobile identity is missing. Remove paired devices before creating a new identity.".into());
            }
            let identity = Identity::generate()?;
            entry
                .set_password(&serde_json::to_string(&identity).map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())?;
            identity
        }
        Err(error) => return Err(format!("Cannot read desktop mobile identity: {error}")),
    };
    inner.identity = Some(identity.clone());
    Ok(identity)
}
fn addresses(inner: &Inner) -> Vec<Address> {
    let mut result: Vec<Address> = if_addrs::get_if_addrs()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|interface| {
            let ip = interface.ip();
            if ip.is_loopback()
                || ip.is_unspecified()
                || matches!(ip, std::net::IpAddr::V6(v) if v.is_unicast_link_local())
            {
                None
            } else {
                Some(Address {
                    host: ip.to_string(),
                    port: PORT,
                })
            }
        })
        .collect();
    if let Some(address) = &inner.router_address {
        result.insert(0, address.clone());
    }
    if let Ok(address) = Address::parse(&inner.config.remote_address) {
        result.insert(0, address);
    }
    result.dedup();
    result.truncate(16);
    result
}
fn name() -> String {
    hostname::get()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned()
}
async fn start(app: &AppHandle, host: &MobileHost) -> Result<(), String> {
    let identity = identity(host)?;
    let mut inner = host
        .inner
        .lock()
        .map_err(|_| "Mobile service unavailable")?;
    if inner.endpoint.is_some() {
        return Ok(());
    }
    let endpoint = molfar_mobile_link::server_endpoint(
        &identity,
        host.gate.clone(),
        format!("[::]:{PORT}").parse().unwrap(),
    )?;
    inner.endpoint = Some(endpoint.clone());
    drop(inner);
    let service = host.clone();
    let watching = host.clone();
    let app = app.clone();
    let watch_app = app.clone();
    tauri::async_runtime::spawn(molfar_mobile_link::serve(
        endpoint,
        host.gate.clone(),
        move |peer, request| {
            let host = service.clone();
            let app = app.clone();
            async move { handle(&app, &host, &peer, request).await }
        },
        move |peer, request, sink| {
            let host = watching.clone();
            let app = watch_app.clone();
            async move { watch(&app, &host, &peer, request, sink) }
        },
    ));
    crate::mobile_router::restart(host);
    Ok(())
}
