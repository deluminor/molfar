//! Companion gateway: lets a paired phone or tablet watch and steer this
//! desktop while MOLFAR is running.
//!
//! The listener is off until the user enables it, and it never binds a
//! wildcard address. In `serve` mode it binds loopback and `tailscale serve`
//! terminates HTTPS for the tailnet; in `tailnet` mode it binds this machine's
//! Tailscale address directly. Every request except pairing carries a device
//! token; only SHA-256 hashes of tokens are stored. App actions are executed by
//! the main window, the same way the `/operator` CLI reaches it.
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};

pub const PROTOCOL_VERSION: u32 = 1;
const DEFAULT_PORT: u16 = 3775;
const STORE_FILE: &str = "companion.json";
const PAIR_TTL_MS: u64 = 5 * 60 * 1000;
const PAIR_ATTEMPTS: u32 = 5;
const PAIR_CODE_LEN: usize = 8;
// No 0/O or 1/I/L: the code is also typed by hand.
const PAIR_ALPHABET: &[u8] = b"ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const DEVICES_MAX: usize = 16;
const DEVICE_NAME_MAX: usize = 60;
const SMALL_BODY: u64 = 8 * 1024;
// Photos travel as base64 inside the RPC body.
const RPC_BODY: u64 = 64 * 1024 * 1024;
const RPC_TIMEOUT: Duration = Duration::from_secs(30);
const PENDING_MAX: usize = 32;
const WORKERS: usize = 8;
const SEEN_PERSIST_MS: u64 = 60_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum BindMode {
    /// Loopback only, published to the tailnet by `tailscale serve` over HTTPS.
    #[default]
    Serve,
    /// This machine's Tailscale address, plain HTTP inside the WireGuard tunnel.
    Tailnet,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Device {
    id: String,
    name: String,
    token_sha256: String,
    created_at: u64,
    last_seen_at: Option<u64>,
    /// Expo push token the phone registered, for approval and question alerts.
    #[serde(default)]
    push_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Stored {
    #[serde(default)]
    enabled: bool,
    #[serde(default)]
    mode: BindMode,
    #[serde(default = "default_port")]
    port: u16,
    /// What the phone dials; detected from Tailscale when left empty.
    #[serde(default)]
    public_url: Option<String>,
    #[serde(default)]
    devices: Vec<Device>,
    /// Push only while this computer's MOLFAR window is not in front.
    #[serde(default = "yes")]
    notify_when_away: bool,
    /// Include what is waiting (tool, question) in the notification text.
    #[serde(default = "yes")]
    notify_details: bool,
}

fn default_port() -> u16 {
    DEFAULT_PORT
}

fn yes() -> bool {
    true
}

impl Default for Stored {
    fn default() -> Self {
        Stored {
            enabled: false,
            mode: BindMode::Serve,
            port: DEFAULT_PORT,
            public_url: None,
            devices: Vec::new(),
            notify_when_away: true,
            notify_details: true,
        }
    }
}

struct Pairing {
    code: String,
    expires_at: u64,
    attempts: u32,
}

struct Running {
    server: Arc<tiny_http::Server>,
    stopped: Arc<AtomicBool>,
    addr: SocketAddr,
}

#[derive(Default)]
struct Inner {
    path: PathBuf,
    stored: Stored,
    pairing: Option<Pairing>,
    pending: HashMap<String, mpsc::Sender<Value>>,
    running: Option<Running>,
    error: Option<String>,
    seen_persisted_at: u64,
}

#[derive(Clone, Default)]
pub struct CompanionHost {
    inner: Arc<Mutex<Inner>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceInfo {
    id: String,
    name: String,
    created_at: u64,
    last_seen_at: Option<u64>,
    push: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TailscaleInfo {
    ip: Option<String>,
    dns_name: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompanionStatus {
    enabled: bool,
    running: bool,
    mode: BindMode,
    port: u16,
    public_url: Option<String>,
    /// The URL a new device would be told to dial.
    effective_url: Option<String>,
    listen_addr: Option<String>,
    error: Option<String>,
    tailscale: TailscaleInfo,
    devices: Vec<DeviceInfo>,
    notify_when_away: bool,
    notify_details: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairingOffer {
    code: String,
    url: String,
    /// Deep link the phone's camera opens straight in BitChain.
    link: String,
    qr_svg: String,
    expires_at: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompanionConfig {
    enabled: bool,
    mode: BindMode,
    port: u16,
    public_url: Option<String>,
    #[serde(default = "yes")]
    notify_when_away: bool,
    #[serde(default = "yes")]
    notify_details: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RequestEvent {
    id: String,
    device_id: String,
    action: String,
    input: Value,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or_default()
}

fn sha256_hex(value: &str) -> String {
    Sha256::digest(value.as_bytes())
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

/// Both inputs are fixed-length hex digests; compare without early exit.
fn digest_eq(a: &str, b: &str) -> bool {
    a.len() == b.len()
        && a.bytes()
            .zip(b.bytes())
            .fold(0u8, |acc, (x, y)| acc | (x ^ y))
            == 0
}

/// 244 random bits from two v4 UUIDs (the OS CSPRNG backs `uuid`).
fn new_token() -> String {
    format!(
        "{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    )
}

fn new_pair_code() -> String {
    let bytes = uuid::Uuid::new_v4().into_bytes();
    bytes
        .iter()
        .take(PAIR_CODE_LEN)
        .map(|b| PAIR_ALPHABET[*b as usize % PAIR_ALPHABET.len()] as char)
        .collect()
}

fn normalize_code(code: &str) -> String {
    code.chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .map(|c| c.to_ascii_uppercase())
        .collect()
}

fn read_store(path: &Path) -> Stored {
    std::fs::read(path)
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

fn write_store(path: &Path, stored: &Stored) -> Result<(), String> {
    let parent = path.parent().ok_or("Missing companion directory")?;
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let temporary = parent.join(format!("companion-{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| -> Result<(), String> {
        let mut options = std::fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&temporary).map_err(|e| e.to_string())?;
        file.write_all(&serde_json::to_vec_pretty(stored).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
        std::fs::rename(&temporary, path).map_err(|e| e.to_string())
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(temporary);
    }
    result
}

/// Tailscale hands out addresses from 100.64.0.0/10.
fn is_tailscale_v4(ip: &Ipv4Addr) -> bool {
    let [a, b, ..] = ip.octets();
    a == 100 && (64..128).contains(&b)
}

fn tailscale_ip() -> Option<Ipv4Addr> {
    if_addrs::get_if_addrs()
        .ok()?
        .into_iter()
        .find_map(|iface| match iface.ip() {
            IpAddr::V4(ip) if is_tailscale_v4(&ip) => Some(ip),
            _ => None,
        })
}

fn tailscale_cli() -> Vec<PathBuf> {
    [
        Some("tailscale"),
        cfg!(target_os = "macos").then_some("/Applications/Tailscale.app/Contents/MacOS/Tailscale"),
        cfg!(windows).then_some(r"C:\Program Files\Tailscale\tailscale.exe"),
    ]
    .into_iter()
    .flatten()
    .map(PathBuf::from)
    .collect()
}

/// This machine's MagicDNS name, such as `erik-mbp.tail1234.ts.net`.
fn tailscale_dns_name() -> Option<String> {
    for cli in tailscale_cli() {
        let Ok(output) = Command::new(&cli).args(["status", "--json"]).output() else {
            continue;
        };
        if !output.status.success() {
            continue;
        }
        let status: Value = serde_json::from_slice(&output.stdout).ok()?;
        let name = status
            .pointer("/Self/DNSName")?
            .as_str()?
            .trim_end_matches('.');
        if !name.is_empty() {
            return Some(name.to_string());
        }
    }
    None
}

fn validate_public_url(url: &str) -> Result<String, String> {
    let parsed = url::Url::parse(url.trim()).map_err(|_| "Public URL is not a valid URL")?;
    match parsed.scheme() {
        "https" => {}
        "http"
            if parsed.host_str().is_some_and(|host| {
                host.parse::<Ipv4Addr>()
                    .is_ok_and(|ip| is_tailscale_v4(&ip))
            }) => {}
        _ => return Err("Use an https:// URL, or http:// with a Tailscale 100.x address".into()),
    }
    if parsed.query().is_some() || parsed.fragment().is_some() {
        return Err("Public URL must not have a query or fragment".into());
    }
    Ok(parsed.as_str().trim_end_matches('/').to_string())
}

fn effective_url(stored: &Stored, addr: Option<SocketAddr>) -> Option<String> {
    if let Some(url) = stored.public_url.as_ref().filter(|url| !url.is_empty()) {
        return Some(url.clone());
    }
    match stored.mode {
        BindMode::Serve => tailscale_dns_name().map(|name| format!("https://{name}")),
        BindMode::Tailnet => addr
            .map(|addr| addr.ip())
            .or_else(|| tailscale_ip().map(IpAddr::V4))
            .map(|ip| format!("http://{ip}:{}", stored.port)),
    }
}

/// Status without the Tailscale probes, which spawn a CLI and must not run
/// while the lock is held: every authenticated request waits on it.
struct Snapshot {
    stored: Stored,
    addr: Option<SocketAddr>,
    error: Option<String>,
}

fn snapshot(inner: &Inner) -> Snapshot {
    Snapshot {
        stored: inner.stored.clone(),
        addr: inner.running.as_ref().map(|running| running.addr),
        error: inner.error.clone(),
    }
}

fn status_of(snapshot: Snapshot) -> CompanionStatus {
    let Snapshot {
        stored,
        addr,
        error,
    } = snapshot;
    CompanionStatus {
        enabled: stored.enabled,
        running: addr.is_some(),
        mode: stored.mode,
        port: stored.port,
        public_url: stored.public_url.clone(),
        effective_url: effective_url(&stored, addr),
        listen_addr: addr.map(|addr| addr.to_string()),
        error,
        tailscale: TailscaleInfo {
            ip: tailscale_ip().map(|ip| ip.to_string()),
            dns_name: tailscale_dns_name(),
        },
        devices: stored
            .devices
            .iter()
            .map(|device| DeviceInfo {
                id: device.id.clone(),
                name: device.name.clone(),
                created_at: device.created_at,
                last_seen_at: device.last_seen_at,
                push: device.push_token.is_some(),
            })
            .collect(),
        notify_when_away: stored.notify_when_away,
        notify_details: stored.notify_details,
    }
}

fn bind_addr(stored: &Stored) -> Result<SocketAddr, String> {
    let ip = match stored.mode {
        BindMode::Serve => IpAddr::V4(Ipv4Addr::LOCALHOST),
        BindMode::Tailnet => {
            IpAddr::V4(tailscale_ip().ok_or("Tailscale is not connected on this computer")?)
        }
    };
    Ok(SocketAddr::new(ip, stored.port))
}

fn stop(inner: &mut Inner) {
    if let Some(running) = inner.running.take() {
        running.stopped.store(true, Ordering::SeqCst);
        for _ in 0..WORKERS {
            running.server.unblock();
        }
    }
    for (_, reply) in inner.pending.drain() {
        let _ = reply.send(json!({"ok": false, "error": "Companion gateway stopped"}));
    }
}

fn start(host: &CompanionHost, app: &AppHandle, inner: &mut Inner) {
    stop(inner);
    inner.error = None;
    if !inner.stored.enabled {
        return;
    }
    let addr = match bind_addr(&inner.stored) {
        Ok(addr) => addr,
        Err(error) => {
            inner.error = Some(error);
            return;
        }
    };
    let server = match tiny_http::Server::http(addr) {
        Ok(server) => Arc::new(server),
        Err(error) => {
            inner.error = Some(format!("Could not listen on {addr}: {error}"));
            return;
        }
    };
    let stopped = Arc::new(AtomicBool::new(false));
    for _ in 0..WORKERS {
        let server = server.clone();
        let stopped = stopped.clone();
        let host = host.clone();
        let app = app.clone();
        std::thread::spawn(move || loop {
            let request = match server.recv() {
                Ok(request) => request,
                Err(_) => return,
            };
            if stopped.load(Ordering::SeqCst) {
                return;
            }
            serve(&host, &app, request);
        });
    }
    inner.running = Some(Running {
        server,
        stopped,
        addr,
    });
}

pub fn init(app: &AppHandle) -> Result<(), String> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join(STORE_FILE);
    let host = CompanionHost::default();
    {
        let mut inner = host.inner.lock().map_err(|_| "Companion unavailable")?;
        inner.stored = read_store(&path);
        inner.path = path;
        start(&host, app, &mut inner);
    }
    app.manage(host);
    Ok(())
}

// ---------------------------------------------------------------- HTTP

struct Reply {
    status: u16,
    body: Value,
}

impl Reply {
    fn ok(body: Value) -> Self {
        Reply { status: 200, body }
    }
    fn error(status: u16, message: &str) -> Self {
        Reply {
            status,
            body: json!({"ok": false, "error": message}),
        }
    }
}

fn header<'a>(request: &'a tiny_http::Request, name: &str) -> Option<&'a str> {
    request
        .headers()
        .iter()
        .find(|h| h.field.as_str().as_str().eq_ignore_ascii_case(name))
        .map(|h| h.value.as_str())
}

fn read_json(request: &mut tiny_http::Request, limit: u64) -> Result<Value, Reply> {
    if request.body_length().is_some_and(|len| len as u64 > limit) {
        return Err(Reply::error(413, "Request is too large"));
    }
    let mut body = Vec::new();
    request
        .as_reader()
        .take(limit + 1)
        .read_to_end(&mut body)
        .map_err(|_| Reply::error(400, "Could not read the request"))?;
    if body.len() as u64 > limit {
        return Err(Reply::error(413, "Request is too large"));
    }
    serde_json::from_slice(&body).map_err(|_| Reply::error(400, "Request body must be JSON"))
}

fn serve(host: &CompanionHost, app: &AppHandle, mut request: tiny_http::Request) {
    let reply = route(host, app, &mut request);
    let body = serde_json::to_vec(&reply.body).unwrap_or_default();
    let mut response = tiny_http::Response::from_data(body).with_status_code(reply.status);
    for (name, value) in [
        ("Content-Type", "application/json; charset=utf-8"),
        ("Cache-Control", "no-store"),
        ("X-Content-Type-Options", "nosniff"),
    ] {
        if let Ok(header) = tiny_http::Header::from_bytes(name, value) {
            response.add_header(header);
        }
    }
    let _ = request.respond(response);
}

fn route(host: &CompanionHost, app: &AppHandle, request: &mut tiny_http::Request) -> Reply {
    let method = request.method().clone();
    let path = request.url().split('?').next().unwrap_or("").to_string();
    match (method, path.as_str()) {
        (tiny_http::Method::Get, "/v1/hello") => {
            let device = authenticate(host, request);
            Reply::ok(json!({
                "ok": true,
                "app": "molfar",
                "protocol": PROTOCOL_VERSION,
                "paired": device.is_some(),
                "version": device.is_some().then(|| app.package_info().version.to_string()),
                "name": device.is_some().then(machine_name),
            }))
        }
        (tiny_http::Method::Post, "/v1/pair") => match read_json(request, SMALL_BODY) {
            Ok(body) => pair(host, &body),
            Err(reply) => reply,
        },
        (method, route) => {
            let Some(device) = authenticate(host, request) else {
                return Reply::error(401, "This device is not paired. Pair it again from MOLFAR.");
            };
            match (method, route) {
                (tiny_http::Method::Get, "/v1/host") => match crate::home_host::sample_host() {
                    Ok(stats) => Reply::ok(json!({"ok": true, "result": stats})),
                    Err(error) => Reply::error(500, &error),
                },
                (tiny_http::Method::Post, "/v1/push") => match read_json(request, SMALL_BODY) {
                    Ok(body) => register_push(host, &device, &body),
                    Err(reply) => reply,
                },
                (tiny_http::Method::Post, "/v1/rpc") => match read_json(request, RPC_BODY) {
                    Ok(body) => rpc(host, app, &device, body),
                    Err(reply) => reply,
                },
                _ => Reply::error(404, "Unknown endpoint"),
            }
        }
    }
}

fn machine_name() -> String {
    sysinfo::System::host_name().unwrap_or_else(|| "MOLFAR".into())
}

/// The paired device behind a bearer token, refreshing when it was last seen.
fn authenticate(host: &CompanionHost, request: &tiny_http::Request) -> Option<String> {
    let token = header(request, "Authorization")?
        .strip_prefix("Bearer ")?
        .trim();
    if token.len() != 64 {
        return None;
    }
    let digest = sha256_hex(token);
    let mut inner = host.inner.lock().ok()?;
    let now = now_ms();
    let device = inner
        .stored
        .devices
        .iter_mut()
        .find(|device| digest_eq(&device.token_sha256, &digest))?;
    device.last_seen_at = Some(now);
    let id = device.id.clone();
    if now.saturating_sub(inner.seen_persisted_at) > SEEN_PERSIST_MS {
        inner.seen_persisted_at = now;
        let _ = write_store(&inner.path, &inner.stored);
    }
    Some(id)
}

fn pair(host: &CompanionHost, body: &Value) -> Reply {
    let code = normalize_code(body.get("code").and_then(Value::as_str).unwrap_or(""));
    let name: String = body
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or("Phone")
        .chars()
        .filter(|c| !c.is_control())
        .take(DEVICE_NAME_MAX)
        .collect();
    let Ok(mut inner) = host.inner.lock() else {
        return Reply::error(500, "Companion unavailable");
    };
    let now = now_ms();
    let Some(pairing) = inner.pairing.as_mut() else {
        return Reply::error(403, "No pairing is open. Show a new code in MOLFAR.");
    };
    if pairing.expires_at < now {
        inner.pairing = None;
        return Reply::error(403, "This code has expired. Show a new code in MOLFAR.");
    }
    if !digest_eq(&sha256_hex(&pairing.code), &sha256_hex(&code)) {
        pairing.attempts += 1;
        if pairing.attempts >= PAIR_ATTEMPTS {
            inner.pairing = None;
            return Reply::error(403, "Too many wrong codes. Show a new code in MOLFAR.");
        }
        return Reply::error(403, "Wrong pairing code");
    }
    inner.pairing = None;
    if inner.stored.devices.len() >= DEVICES_MAX {
        return Reply::error(409, "Too many paired devices. Remove one in MOLFAR first.");
    }
    let token = new_token();
    let device = Device {
        id: uuid::Uuid::new_v4().to_string(),
        name: if name.trim().is_empty() {
            "Phone".into()
        } else {
            name.trim().to_string()
        },
        token_sha256: sha256_hex(&token),
        created_at: now,
        last_seen_at: Some(now),
        push_token: None,
    };
    let device_id = device.id.clone();
    inner.stored.devices.push(device);
    if let Err(error) = write_store(&inner.path, &inner.stored) {
        inner.stored.devices.retain(|device| device.id != device_id);
        return Reply::error(500, &error);
    }
    Reply::ok(json!({
        "ok": true,
        "deviceId": device_id,
        "token": token,
        "protocol": PROTOCOL_VERSION,
        "name": machine_name(),
    }))
}

fn valid_push_token(token: &str) -> bool {
    let inner = token
        .strip_prefix("ExponentPushToken[")
        .or_else(|| token.strip_prefix("ExpoPushToken["))
        .and_then(|rest| rest.strip_suffix(']'));
    inner.is_some_and(|inner| {
        !inner.is_empty()
            && inner.len() <= 200
            && inner
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    })
}

/// The phone's Expo push token, or `null` to stop alerts to it.
fn register_push(host: &CompanionHost, device: &str, body: &Value) -> Reply {
    let token = match body.get("token") {
        Some(Value::Null) | None => None,
        Some(Value::String(token)) if valid_push_token(token) => Some(token.clone()),
        _ => return Reply::error(400, "token must be an Expo push token or null"),
    };
    let Ok(mut inner) = host.inner.lock() else {
        return Reply::error(500, "Companion unavailable");
    };
    let Some(entry) = inner
        .stored
        .devices
        .iter_mut()
        .find(|entry| entry.id == device)
    else {
        return Reply::error(401, "This device is not paired");
    };
    entry.push_token = token;
    match write_store(&inner.path, &inner.stored) {
        Ok(()) => Reply::ok(json!({"ok": true})),
        Err(error) => Reply::error(500, &error),
    }
}

const EXPO_PUSH_URL: &str = "https://exp.host/--/api/v2/push/send";

/// Expo answers per message; a token Apple no longer knows is dropped.
fn dead_tokens(tokens: &[String], response: &Value) -> Vec<String> {
    let Some(results) = response.get("data").and_then(Value::as_array) else {
        return Vec::new();
    };
    tokens
        .iter()
        .zip(results)
        .filter(|(_, result)| {
            result.pointer("/details/error").and_then(Value::as_str) == Some("DeviceNotRegistered")
        })
        .map(|(token, _)| token.clone())
        .collect()
}

fn push_messages(tokens: &[String], title: &str, body: &str, data: &Value) -> Value {
    Value::Array(
        tokens
            .iter()
            .map(|token| {
                json!({
                    "to": token,
                    "title": title,
                    "body": body,
                    "data": data,
                    "sound": "default",
                    "priority": "high",
                    "interruptionLevel": "time-sensitive",
                })
            })
            .collect(),
    )
}

fn rpc(host: &CompanionHost, app: &AppHandle, device: &str, body: Value) -> Reply {
    let action = body.get("action").and_then(Value::as_str).unwrap_or("");
    if action.is_empty() || action.len() > 64 {
        return Reply::error(400, "action is required");
    }
    let input = body.get("input").cloned().unwrap_or_else(|| json!({}));
    if !input.is_object() {
        return Reply::error(400, "input must be an object");
    }
    let id = uuid::Uuid::new_v4().to_string();
    let (tx, rx) = mpsc::channel();
    {
        let Ok(mut inner) = host.inner.lock() else {
            return Reply::error(500, "Companion unavailable");
        };
        if inner.pending.len() >= PENDING_MAX {
            return Reply::error(429, "Too many requests in flight");
        }
        inner.pending.insert(id.clone(), tx);
    }
    let event = RequestEvent {
        id: id.clone(),
        device_id: device.to_string(),
        action: action.to_string(),
        input,
    };
    let result = if app
        .emit_to("main", "molfar-companion-request", event)
        .is_err()
    {
        Err("MOLFAR's main window is unavailable")
    } else {
        rx.recv_timeout(RPC_TIMEOUT)
            .map_err(|_| "MOLFAR did not answer in time")
    };
    if let Ok(mut inner) = host.inner.lock() {
        inner.pending.remove(&id);
    }
    match result {
        Ok(value) if value.get("ok").and_then(Value::as_bool) == Some(true) => Reply::ok(value),
        Ok(value) => Reply {
            status: 422,
            body: value,
        },
        Err(error) => Reply::error(503, error),
    }
}

// ---------------------------------------------------------------- Commands

fn lock(host: &CompanionHost) -> Result<std::sync::MutexGuard<'_, Inner>, String> {
    host.inner
        .lock()
        .map_err(|_| "Companion unavailable".to_string())
}

#[tauri::command(async)]
pub fn companion_status(host: State<'_, CompanionHost>) -> Result<CompanionStatus, String> {
    let snapshot = snapshot(&*lock(&host)?);
    Ok(status_of(snapshot))
}

#[tauri::command(async)]
pub fn companion_configure(
    app: AppHandle,
    host: State<'_, CompanionHost>,
    config: CompanionConfig,
) -> Result<CompanionStatus, String> {
    if config.port < 1024 {
        return Err("Use a port from 1024 to 65535".into());
    }
    let public_url = match config.public_url.as_deref().map(str::trim) {
        Some(url) if !url.is_empty() => Some(validate_public_url(url)?),
        _ => None,
    };
    let host = host.inner();
    let mut inner = lock(host)?;
    let previous = inner.stored.clone();
    inner.stored.enabled = config.enabled;
    inner.stored.mode = config.mode;
    inner.stored.port = config.port;
    inner.stored.public_url = public_url;
    inner.stored.notify_when_away = config.notify_when_away;
    inner.stored.notify_details = config.notify_details;
    if let Err(error) = write_store(&inner.path, &inner.stored) {
        inner.stored = previous;
        return Err(error);
    }
    if !config.enabled {
        inner.pairing = None;
    }
    start(host, &app, &mut inner);
    let snapshot = snapshot(&inner);
    drop(inner);
    Ok(status_of(snapshot))
}

#[tauri::command(async)]
pub fn companion_pair_start(host: State<'_, CompanionHost>) -> Result<PairingOffer, String> {
    let (stored, addr) = {
        let inner = lock(&host)?;
        let addr = inner
            .running
            .as_ref()
            .map(|running| running.addr)
            .ok_or("Turn on the Companion gateway first")?;
        (inner.stored.clone(), addr)
    };
    let url = effective_url(&stored, Some(addr))
        .ok_or("MOLFAR could not find this computer's Tailscale name. Enter the public URL.")?;
    let code = new_pair_code();
    let expires_at = now_ms() + PAIR_TTL_MS;
    let mut link = url::Url::parse("bitchain://molfar/pair").map_err(|e| e.to_string())?;
    link.query_pairs_mut()
        .append_pair("url", &url)
        .append_pair("code", &code);
    let link = link.to_string();
    let qr_svg = qrcode::QrCode::new(link.as_bytes())
        .map_err(|e| e.to_string())?
        .render::<qrcode::render::svg::Color>()
        .min_dimensions(220, 220)
        .quiet_zone(true)
        .build();
    lock(&host)?.pairing = Some(Pairing {
        code: code.clone(),
        expires_at,
        attempts: 0,
    });
    Ok(PairingOffer {
        code,
        url,
        link,
        qr_svg,
        expires_at,
    })
}

#[tauri::command(async)]
pub fn companion_pair_cancel(host: State<'_, CompanionHost>) -> Result<(), String> {
    lock(&host)?.pairing = None;
    Ok(())
}

#[tauri::command(async)]
pub fn companion_revoke(
    host: State<'_, CompanionHost>,
    device_id: String,
) -> Result<CompanionStatus, String> {
    let mut inner = lock(&host)?;
    let previous = inner.stored.devices.clone();
    inner.stored.devices.retain(|device| device.id != device_id);
    if let Err(error) = write_store(&inner.path, &inner.stored) {
        inner.stored.devices = previous;
        return Err(error);
    }
    let snapshot = snapshot(&inner);
    drop(inner);
    Ok(status_of(snapshot))
}

/// Tells paired phones that something is waiting on the user. Text is short and
/// may be replaced with a generic line when details are turned off.
#[tauri::command(async)]
pub fn companion_notify(
    app: AppHandle,
    host: State<'_, CompanionHost>,
    title: String,
    body: String,
    data: Value,
) -> Result<(), String> {
    let (tokens, details, when_away) = {
        let inner = lock(&host)?;
        if !inner.stored.enabled {
            return Ok(());
        }
        let tokens: Vec<String> = inner
            .stored
            .devices
            .iter()
            .filter_map(|device| device.push_token.clone())
            .collect();
        (
            tokens,
            inner.stored.notify_details,
            inner.stored.notify_when_away,
        )
    };
    if tokens.is_empty() {
        return Ok(());
    }
    if when_away
        && app
            .get_webview_window("main")
            .and_then(|window| window.is_focused().ok())
            .unwrap_or(false)
    {
        return Ok(());
    }
    let title: String = title.chars().take(120).collect();
    let body: String = if details {
        body.chars().take(240).collect()
    } else {
        "Open BitChain to see what is waiting.".into()
    };
    let messages = push_messages(&tokens, &title, &body, &data);
    let host = host.inner().clone();
    std::thread::spawn(move || {
        let response = ureq::post(EXPO_PUSH_URL)
            .set("Accept", "application/json")
            .set("Content-Type", "application/json")
            .timeout(Duration::from_secs(15))
            .send_string(&messages.to_string());
        let Ok(response) = response else { return };
        let Ok(text) = response.into_string() else {
            return;
        };
        let Ok(value) = serde_json::from_str::<Value>(&text) else {
            return;
        };
        let dead = dead_tokens(&tokens, &value);
        if dead.is_empty() {
            return;
        }
        if let Ok(mut inner) = host.inner.lock() {
            for device in inner.stored.devices.iter_mut() {
                if device
                    .push_token
                    .as_ref()
                    .is_some_and(|token| dead.contains(token))
                {
                    device.push_token = None;
                }
            }
            let _ = write_store(&inner.path, &inner.stored);
        }
    });
    Ok(())
}

#[tauri::command]
pub fn companion_reply(
    window: WebviewWindow,
    host: State<'_, CompanionHost>,
    id: String,
    response: Value,
) -> Result<(), String> {
    if window.label() != "main" {
        return Ok(());
    }
    if let Some(reply) = lock(&host)?.pending.remove(&id) {
        let _ = reply.send(response);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognizes_only_tailscale_addresses() {
        assert!(is_tailscale_v4(&Ipv4Addr::new(100, 64, 0, 1)));
        assert!(is_tailscale_v4(&Ipv4Addr::new(100, 127, 255, 254)));
        assert!(!is_tailscale_v4(&Ipv4Addr::new(100, 128, 0, 1)));
        assert!(!is_tailscale_v4(&Ipv4Addr::new(192, 168, 1, 10)));
    }

    #[test]
    fn public_urls_must_be_https_or_tailnet_http() {
        assert_eq!(
            validate_public_url("https://mbp.tail1.ts.net/").unwrap(),
            "https://mbp.tail1.ts.net"
        );
        assert!(validate_public_url("http://100.101.1.2:3775").is_ok());
        assert!(validate_public_url("http://192.168.1.4:3775").is_err());
        assert!(validate_public_url("http://example.com").is_err());
        assert!(validate_public_url("https://x.ts.net/?a=1").is_err());
    }

    #[test]
    fn pair_codes_avoid_ambiguous_characters() {
        for _ in 0..50 {
            let code = new_pair_code();
            assert_eq!(code.len(), PAIR_CODE_LEN);
            assert!(code.bytes().all(|b| PAIR_ALPHABET.contains(&b)));
        }
        assert_eq!(normalize_code(" ab-cd 23 "), "ABCD23");
    }

    #[test]
    fn accepts_only_expo_push_tokens() {
        assert!(valid_push_token("ExponentPushToken[abc-DEF_123]"));
        assert!(valid_push_token("ExpoPushToken[xyz]"));
        assert!(!valid_push_token("ExponentPushToken[]"));
        assert!(!valid_push_token("ExponentPushToken[a b]"));
        assert!(!valid_push_token("https://evil.example"));
    }

    #[test]
    fn drops_tokens_apple_no_longer_knows() {
        let tokens = vec!["A".to_string(), "B".to_string()];
        let response = json!({"data": [
            {"status": "ok", "id": "1"},
            {"status": "error", "details": {"error": "DeviceNotRegistered"}}
        ]});
        assert_eq!(dead_tokens(&tokens, &response), vec!["B".to_string()]);
        let messages = push_messages(
            &tokens,
            "Vedmid needs you",
            "Approve rm -rf dist",
            &json!({"k": 1}),
        );
        assert_eq!(messages[1]["to"], "B");
        assert_eq!(messages[0]["priority"], "high");
    }

    #[test]
    fn devices_register_and_clear_push_tokens() {
        let dir = temp_dir();
        let host = host_with(&dir);
        let paired = pair(&host, &json!({"code": "ABCD2345", "name": "iPad"}));
        let device = paired.body["deviceId"].as_str().unwrap().to_string();
        assert_eq!(
            register_push(&host, &device, &json!({"token": "ExponentPushToken[t1]"})).status,
            200
        );
        assert_eq!(
            host.inner.lock().unwrap().stored.devices[0]
                .push_token
                .as_deref(),
            Some("ExponentPushToken[t1]")
        );
        assert_eq!(
            register_push(&host, &device, &json!({"token": "nope"})).status,
            400
        );
        assert_eq!(
            register_push(&host, &device, &json!({"token": null})).status,
            200
        );
        assert!(host.inner.lock().unwrap().stored.devices[0]
            .push_token
            .is_none());
        assert_eq!(
            register_push(&host, "other", &json!({"token": null})).status,
            401
        );
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn older_stores_keep_alerts_on() {
        let stored: Stored = serde_json::from_str(r#"{"enabled": true, "devices": []}"#).unwrap();
        assert!(stored.notify_when_away && stored.notify_details);
    }

    #[test]
    fn tokens_are_long_and_compared_by_digest() {
        let token = new_token();
        assert_eq!(token.len(), 64);
        assert_ne!(token, new_token());
        assert!(digest_eq(&sha256_hex(&token), &sha256_hex(&token)));
        assert!(!digest_eq(&sha256_hex(&token), &sha256_hex("other")));
    }

    fn host_with(dir: &Path) -> CompanionHost {
        let host = CompanionHost::default();
        {
            let mut inner = host.inner.lock().unwrap();
            inner.path = dir.join(STORE_FILE);
            inner.pairing = Some(Pairing {
                code: "ABCD2345".into(),
                expires_at: now_ms() + 60_000,
                attempts: 0,
            });
        }
        host
    }

    fn temp_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("molfar-companion-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn pairing_issues_a_token_once_and_stores_only_its_hash() {
        let dir = temp_dir();
        let host = host_with(&dir);
        let reply = pair(
            &host,
            &json!({"code": "abcd-2345", "name": "Erik's iPhone"}),
        );
        assert_eq!(reply.status, 200);
        let token = reply.body["token"].as_str().unwrap().to_string();
        let stored = std::fs::read_to_string(dir.join(STORE_FILE)).unwrap();
        assert!(!stored.contains(&token));
        assert!(stored.contains(&sha256_hex(&token)));
        assert!(stored.contains("Erik's iPhone"));
        // The code is single-use.
        assert_eq!(pair(&host, &json!({"code": "ABCD2345"})).status, 403);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn wrong_codes_close_the_pairing_window() {
        let dir = temp_dir();
        let host = host_with(&dir);
        for _ in 0..PAIR_ATTEMPTS {
            assert_eq!(pair(&host, &json!({"code": "WRONG000"})).status, 403);
        }
        assert!(host.inner.lock().unwrap().pairing.is_none());
        assert_eq!(pair(&host, &json!({"code": "ABCD2345"})).status, 403);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn expired_codes_are_refused() {
        let dir = temp_dir();
        let host = host_with(&dir);
        host.inner
            .lock()
            .unwrap()
            .pairing
            .as_mut()
            .unwrap()
            .expires_at = 1;
        assert_eq!(pair(&host, &json!({"code": "ABCD2345"})).status, 403);
        let _ = std::fs::remove_dir_all(dir);
    }
}
