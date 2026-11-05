use super::types::{Host, Inner};
use std::{
    sync::{
        Arc, Mutex, Weak,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, Instant},
};

#[derive(Clone)]
pub(crate) struct Permit {
    inner: Weak<Mutex<Inner>>,
    device: String,
    deadline: Instant,
    cancelled: Arc<AtomicBool>,
    stopped: Arc<AtomicBool>,
}

impl Permit {
    pub(super) fn new(
        host: &Host,
        device: &str,
        timeout: Duration,
        stopped: Arc<AtomicBool>,
    ) -> Self {
        Self {
            stopped,
            inner: Arc::downgrade(&host.inner),
            device: device.into(),
            deadline: Instant::now() + timeout,
            cancelled: Default::default(),
        }
    }

    pub(crate) fn check(&self) -> Result<(), String> {
        if self.cancelled.load(Ordering::SeqCst)
            || self.stopped.load(Ordering::SeqCst)
            || Instant::now() >= self.deadline
        {
            return Err("Companion request expired; no session was started".into());
        }
        let inner = self.inner.upgrade().ok_or("Companion is unavailable")?;
        let inner = inner.lock().map_err(|_| "Companion is unavailable")?;
        if inner.closed
            || !inner.stored.enabled
            || !inner
                .stored
                .devices
                .iter()
                .any(|device| device.id == self.device)
        {
            return Err("Companion access was turned off or revoked".into());
        }
        Ok(())
    }

    pub(super) fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::companion::types::Device;
    #[test]
    fn companion_permits_expire_cancel_and_recheck_device_access() {
        let (host, _) = Host::open(
            std::env::temp_dir()
                .join(format!("companion-permit-{}", uuid::Uuid::new_v4()))
                .join("companion.json"),
        )
        .unwrap();
        {
            let mut inner = host.inner.lock().unwrap();
            inner.stored.enabled = true;
            inner.stored.devices.push(Device {
                id: "device".into(),
                name: "Fixture".into(),
                token_sha256: "hash".into(),
                created_at: 0,
                last_seen_at: None,
            });
        }
        let permit = Permit::new(&host, "device", Duration::from_secs(10), Default::default());
        assert!(permit.check().is_ok());
        assert!(
            Permit::new(&host, "device", Duration::ZERO, Default::default())
                .check()
                .is_err()
        );
        let cancelled = permit.clone();
        cancelled.cancel();
        assert!(permit.check().is_err());
        let permit = Permit::new(&host, "device", Duration::from_secs(10), Default::default());
        host.inner.lock().unwrap().stored.devices.clear();
        assert!(permit.check().is_err());
        host.shutdown();
        assert!(permit.check().is_err());
    }
}
