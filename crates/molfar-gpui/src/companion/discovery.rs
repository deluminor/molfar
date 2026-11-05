use super::types::Host;
use std::{net::Ipv4Addr, path::PathBuf, sync::Arc, time::Duration};

#[derive(Clone, Default)]
pub(super) struct Snapshot {
    pub ip: Option<Ipv4Addr>,
    pub dns: Option<String>,
}

impl Host {
    pub(super) fn start_discovery(&self) {
        let inner = Arc::downgrade(&self.inner);
        std::thread::spawn(move || {
            while refresh(&inner, read) {
                std::thread::sleep(Duration::from_secs(30));
            }
        });
    }
}

fn refresh(
    inner: &std::sync::Weak<std::sync::Mutex<super::types::Inner>>,
    discover: impl FnOnce() -> Snapshot,
) -> bool {
    let Some(state) = inner.upgrade() else {
        return false;
    };
    if state.lock().map_or(true, |state| state.closed) {
        return false;
    }
    drop(state);
    let snapshot = discover();
    let Some(state) = inner.upgrade() else {
        return false;
    };
    if let Ok(mut state) = state.lock() {
        if state.closed {
            return false;
        }
        state.discovery = snapshot;
        return true;
    }
    false
}

fn read() -> Snapshot {
    let ip = super::gateway::tailscale_ip();
    let mut dns = None;
    for cli in [
        Some(PathBuf::from("tailscale")),
        cfg!(target_os = "macos")
            .then(|| PathBuf::from("/Applications/Tailscale.app/Contents/MacOS/Tailscale")),
        cfg!(windows).then(|| PathBuf::from(r"C:\Program Files\Tailscale\tailscale.exe")),
    ]
    .into_iter()
    .flatten()
    {
        let output = molfar_core::cli::output(
            &cli,
            &["status".into(), "--json".into()],
            &std::env::temp_dir(),
            Duration::from_secs(2),
        );
        let Ok(output) = output else {
            continue;
        };
        let Ok(status) = serde_json::from_str::<serde_json::Value>(&output) else {
            continue;
        };
        dns = status
            .pointer("/Self/DNSName")
            .and_then(|name| name.as_str())
            .map(|name| name.trim_end_matches('.').to_string())
            .filter(|name| !name.is_empty());
        if dns.is_some() {
            break;
        }
    }
    Snapshot { ip, dns }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn companion_discovery_never_holds_the_status_lock_while_waiting() {
        let path = std::env::temp_dir()
            .join(format!("companion-discovery-{}", uuid::Uuid::new_v4()))
            .join("companion.json");
        let (host, _) = Host::open(path).unwrap();
        let weak = Arc::downgrade(&host.inner);
        let (started, waiting) = std::sync::mpsc::channel();
        let (release, gate) = std::sync::mpsc::channel();
        let worker = std::thread::spawn(move || {
            refresh(&weak, || {
                started.send(()).unwrap();
                gate.recv_timeout(Duration::from_secs(3)).unwrap();
                Snapshot {
                    ip: None,
                    dns: Some("stale.ts.net".into()),
                }
            })
        });
        waiting.recv_timeout(Duration::from_secs(3)).unwrap();
        let (status, read) = std::sync::mpsc::channel();
        let clone = host.clone();
        let observer = std::thread::spawn(move || status.send(clone.status().unwrap()).unwrap());
        assert!(read.recv_timeout(Duration::from_secs(1)).is_ok());
        host.shutdown();
        release.send(()).unwrap();
        assert!(!worker.join().unwrap());
        observer.join().unwrap();
        assert!(host.status().unwrap().tailscale_dns.is_none());
    }
}
