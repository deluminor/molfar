use crate::{inbox::Inbox, runtime::Database};
use gpui::Entity;
use molfar_core::{
    automations::{Automation, Service},
    host::{HostStats, Sampler},
    store::Session,
};
use std::{
    collections::VecDeque,
    sync::{Arc, Mutex},
    time::Duration,
};

pub(crate) const HOST_INTERVAL: Duration = Duration::from_secs(2);
/// Sessions and automations reload every this many host samples.
pub(crate) const RECORDS_EVERY: u32 = 15;
pub(crate) const HISTORY: usize = 60;

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

#[derive(Clone, Debug, Default, PartialEq)]
pub(crate) struct HostFeed {
    pub latest: Option<HostStats>,
    pub cpu: VecDeque<f32>,
    pub memory: VecDeque<f32>,
    pub error: Option<String>,
}

impl HostFeed {
    pub(crate) fn push(&mut self, sample: Result<HostStats, String>) {
        match sample {
            Ok(stats) => {
                if let Some(cpu) = stats.cpu_percent {
                    push_capped(&mut self.cpu, cpu);
                }
                push_capped(&mut self.memory, stats.memory_percent);
                self.latest = Some(stats);
                self.error = None;
            }
            Err(error) => {
                if self.error.as_ref() != Some(&error) {
                    eprintln!("molfar: home host sample failed: {error}");
                }
                self.error = Some(error);
            }
        }
    }
}

fn push_capped(history: &mut VecDeque<f32>, value: f32) {
    if history.len() == HISTORY {
        history.pop_front();
    }
    history.push_back(value);
}

pub(crate) struct Feeds {
    pub sessions: Load<Vec<Session>>,
    pub automations: Load<Vec<Automation>>,
    pub host: HostFeed,
    pub sampler: Arc<Mutex<Sampler>>,
    pub loading_records: bool,
    pub ticks: u32,
}

impl Default for Feeds {
    fn default() -> Self {
        Feeds {
            sessions: Load::Loading,
            automations: Load::Loading,
            host: HostFeed::default(),
            sampler: Arc::default(),
            loading_records: false,
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

pub(crate) fn sample_host(sampler: &Mutex<Sampler>) -> Result<HostStats, String> {
    sampler
        .lock()
        .map_err(|_| "Host sampler is unavailable".to_string())?
        .sample()
}

#[cfg(test)]
mod tests {
    use super::{HISTORY, HostFeed};
    use molfar_core::host::HostStats;

    #[test]
    fn host_history_is_capped_and_errors_keep_the_last_reading() {
        let mut feed = HostFeed::default();
        for step in 0..HISTORY + 5 {
            feed.push(Ok(HostStats {
                cpu_percent: Some(step as f32),
                memory_percent: 50.,
                ..Default::default()
            }));
        }
        assert_eq!(feed.cpu.len(), HISTORY);
        assert_eq!(feed.cpu.front().copied(), Some(5.));

        feed.push(Err("busy".into()));
        assert_eq!(feed.error.as_deref(), Some("busy"));
        assert!(feed.latest.is_some());
    }
}
