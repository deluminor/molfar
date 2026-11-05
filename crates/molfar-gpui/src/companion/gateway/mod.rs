use super::http::{self, Job};
use async_channel::Sender;
use if_addrs::get_if_addrs;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Write,
    net::{IpAddr, Ipv4Addr, SocketAddr},
    path::{Path, PathBuf},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    time::{SystemTime, UNIX_EPOCH},
};

#[path = "network.rs"]
mod network;
#[path = "pairing.rs"]
mod pairing;
#[path = "persistence.rs"]
mod persistence;
use super::types::*;
pub(super) use network::tailscale_ip;
use network::*;
pub(super) use pairing::{pair, touch_seen};
use persistence::*;
#[path = "helpers.rs"]
mod helpers;
use helpers::*;

impl Host {
    pub(crate) fn open(path: PathBuf) -> Result<(Self, async_channel::Receiver<Job>), String> {
        let (jobs, rx) = async_channel::unbounded();
        let host = Self {
            inner: Arc::new(Mutex::new(Inner {
                stored: read_store(&path),
                path,
                pairing: None,
                running: None,
                draining: None,
                error: None,
                seen_persisted_at: 0,
                jobs,
                discovery: Default::default(),
                closed: false,
            })),
            sampler: Default::default(),
        };
        host.apply()?;
        if !cfg!(test) {
            host.start_discovery();
        }
        Ok((host, rx))
    }

    pub(crate) fn status(&self) -> Result<Status, String> {
        let inner = lock(&self.inner)?;
        Ok(status_of(&inner))
    }

    pub(crate) fn set_enabled(&self, enabled: bool, port: u16) -> Result<Status, String> {
        let status = self.status()?;
        self.configure(enabled, status.mode, port, status.public_url)
    }

    pub(crate) fn configure(
        &self,
        enabled: bool,
        mode: BindMode,
        port: u16,
        public_url: Option<String>,
    ) -> Result<Status, String> {
        if port < 1024 {
            return Err("Use a port from 1024 to 65535".into());
        }
        let public_url = match public_url.as_deref().map(str::trim) {
            Some(url) if !url.is_empty() => Some(validate_public_url(url)?),
            _ => None,
        };
        let mut inner = lock(&self.inner)?;
        if inner.closed {
            return Err("Companion is closed".into());
        }
        let previous = inner.stored.clone();
        inner.stored.enabled = enabled;
        inner.stored.mode = mode;
        inner.stored.port = port;
        inner.stored.public_url = public_url;
        if let Err(error) = write_store(&inner.path, &inner.stored) {
            inner.stored = previous;
            return Err(error);
        }
        if !enabled {
            inner.pairing = None;
        }
        restart(self, &mut inner);
        Ok(status_of(&inner))
    }

    pub(crate) fn pair_start(&self) -> Result<Offer, String> {
        let mut inner = lock(&self.inner)?;
        let addr = inner
            .running
            .as_ref()
            .map(|running| running.addr)
            .ok_or("Turn on the Companion gateway first")?;
        let url = effective_url(&inner.stored, Some(addr), &inner.discovery)
            .ok_or("MOLFAR could not find this computer's Tailscale name. Enter the public URL.")?;
        let code = new_pair_code();
        let expires_at = now_ms() + PAIR_TTL_MS;
        let mut link = url::Url::parse("bitchain://molfar/pair").map_err(|e| e.to_string())?;
        link.query_pairs_mut()
            .append_pair("url", &url)
            .append_pair("code", &code);
        inner.pairing = Some(Pairing {
            code: code.clone(),
            expires_at,
            attempts: 0,
        });
        Ok(Offer {
            code,
            url,
            link: link.to_string(),
            expires_at,
        })
    }

    pub(crate) fn pair_cancel(&self) -> Result<(), String> {
        lock(&self.inner)?.pairing = None;
        Ok(())
    }

    pub(crate) fn revoke(&self, device_id: &str) -> Result<Status, String> {
        let mut inner = lock(&self.inner)?;
        let previous = inner.stored.devices.clone();
        inner.stored.devices.retain(|device| device.id != device_id);
        if let Err(error) = write_store(&inner.path, &inner.stored) {
            inner.stored.devices = previous;
            return Err(error);
        }
        Ok(status_of(&inner))
    }

    pub(crate) fn shutdown(&self) {
        if let Ok(mut inner) = self.inner.lock() {
            inner.closed = true;
            stop(&mut inner);
        }
    }

    fn apply(&self) -> Result<(), String> {
        let mut inner = lock(&self.inner)?;
        restart(self, &mut inner);
        Ok(())
    }
}

fn restart(host: &Host, inner: &mut Inner) {
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
    let server = match inner
        .draining
        .as_ref()
        .filter(|(previous, _)| *previous == addr)
        .and_then(|(_, server)| server.upgrade())
    {
        Some(server) => server,
        None => match tiny_http::Server::http(addr) {
            Ok(server) => Arc::new(server),
            Err(error) => {
                inner.error = Some(format!("Could not listen on {addr}: {error}"));
                return;
            }
        },
    };
    let stopped = Arc::new(AtomicBool::new(false));
    for _ in 0..http::WORKERS {
        let server = server.clone();
        let stopped = stopped.clone();
        let host = host.clone();
        std::thread::spawn(move || http::worker(server, stopped, host));
    }
    inner.running = Some(Running {
        server,
        stopped,
        addr,
    });
}

fn stop(inner: &mut Inner) {
    if let Some(running) = inner.running.take() {
        inner.draining = Some((running.addr, Arc::downgrade(&running.server)));
        running.stopped.store(true, Ordering::SeqCst);
        for _ in 0..http::WORKERS {
            running.server.unblock();
        }
    }
}

pub(super) fn jobs(host: &Host) -> Option<Sender<Job>> {
    host.inner.lock().ok().map(|inner| inner.jobs.clone())
}

pub(super) fn machine_name() -> String {
    let mut buf = [0u8; 256];
    let ok = unsafe { libc::gethostname(buf.as_mut_ptr().cast(), buf.len()) == 0 };
    if ok {
        let end = buf.iter().position(|byte| *byte == 0).unwrap_or(buf.len());
        if let Ok(name) = std::str::from_utf8(&buf[..end])
            && !name.is_empty()
        {
            return name.to_string();
        }
    }
    "MOLFAR".into()
}

fn lock(inner: &Mutex<Inner>) -> Result<std::sync::MutexGuard<'_, Inner>, String> {
    inner.lock().map_err(|_| "Companion unavailable".into())
}

#[cfg(test)]
#[path = "tests.rs"]
mod tests;

#[cfg(test)]
#[path = "lifecycle_tests.rs"]
mod lifecycle_tests;
