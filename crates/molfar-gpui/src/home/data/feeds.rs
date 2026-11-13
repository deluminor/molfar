use crate::{inbox::Inbox, runtime::Database};
use gpui::Entity;
use molfar_core::{
    automations::{Automation, Service},
    host::{HostStats, Sampler},
    store::Session,
};
use std::{
    sync::{Arc, Mutex},
    time::Duration,
};

pub(crate) const HOST_INTERVAL: Duration = Duration::from_secs(2);
/// Sessions and automations reload every this many host samples.
pub(crate) const RECORDS_EVERY: u32 = 15;
#[path = "host/history.rs"]
pub(crate) mod history;
pub(crate) use history::HostFeed;

#[derive(Clone, Debug, PartialEq)]
pub(crate) enum Load<T> {
    Loading,
    Ready(T),
    Failed(String),
}

/// What the shell already owns that Home reads; nothing here opens its own store.
#[derive(Clone, Default)]
pub(crate) struct Sources {
    pub store: Option<Database>,
    pub automations: Option<Arc<Mutex<Service>>>,
    pub inbox: Option<Entity<Inbox>>,
    pub project: String,
}

pub(crate) struct Feeds {
    pub sessions: Load<Vec<Session>>,
    pub automations: Load<Vec<Automation>>,
    pub consumption: super::consumption::Consumption,
    pub host: HostFeed,
    pub sampler: Arc<Mutex<Sampler>>,
    pub records_updated_at: Option<u64>,
    pub loading_records: bool,
    pub loading_host: bool,
    pub ticks: u32,
}

impl Default for Feeds {
    fn default() -> Self {
        Feeds {
            sessions: Load::Loading,
            automations: Load::Loading,
            consumption: Default::default(),
            host: HostFeed::default(),
            sampler: Arc::default(),
            records_updated_at: None,
            loading_records: false,
            loading_host: false,
            ticks: 0,
        }
    }
}

pub(crate) fn load_sessions(store: Option<Database>) -> Result<Vec<Session>, String> {
    let store = store.ok_or("Sessions are unavailable")?;
    crate::runtime::locked(&store)?.sessions()
}

pub(crate) fn load_automations(
    service: Option<Arc<Mutex<Service>>>,
) -> Option<Result<Vec<Automation>, String>> {
    let service = service?;
    Some(
        service
            .lock()
            .map_err(|_| "Automations are unavailable".to_string())
            .and_then(|mut service| service.list()),
    )
}

pub(crate) fn sample_host(sampler: &Mutex<Sampler>, reset: bool) -> Result<HostStats, String> {
    let mut sampler = sampler
        .lock()
        .map_err(|_| "Host sampler is unavailable".to_string())?;
    if reset {
        *sampler = Sampler::default();
    }
    sampler.sample()
}
