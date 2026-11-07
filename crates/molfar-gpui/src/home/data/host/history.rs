use molfar_core::host::HostStats;
use std::collections::VecDeque;

pub(crate) const WINDOW_MS: u64 = 30 * 60 * 1000;
pub(crate) const GAP_MS: u64 = 6_000;
const CAPACITY: usize = 901;

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct Sample {
    pub at: u64,
    pub stats: Option<HostStats>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub(crate) struct HostFeed {
    pub latest: Option<HostStats>,
    pub history: VecDeque<Sample>,
    pub error: Option<String>,
    pub updated_at: Option<u64>,
}

impl HostFeed {
    pub(crate) fn needs_baseline(&self, now: u64) -> bool {
        self.history.back().is_none_or(|last| {
            last.stats.is_none() || now < last.at || now.saturating_sub(last.at) > GAP_MS
        })
    }

    pub(crate) fn push(&mut self, sample: Result<HostStats, String>) {
        self.push_at(sample, molfar_core::time::now_ms());
    }

    pub(crate) fn push_at(&mut self, sample: Result<HostStats, String>, now: u64) {
        if self.history.back().is_some_and(|last| last.at > now) {
            self.history.clear();
        }
        while self
            .history
            .front()
            .is_some_and(|first| now.saturating_sub(first.at) > WINDOW_MS)
            || self.history.len() >= CAPACITY
        {
            self.history.pop_front();
        }

        let stats = match sample {
            Ok(stats) => {
                self.latest = Some(stats);
                self.updated_at = Some(now);
                self.error = None;
                Some(stats)
            }
            Err(error) => {
                if self.error.as_ref() != Some(&error) {
                    eprintln!("molfar: home host sample failed: {error}");
                }
                self.error = Some(error);
                None
            }
        };
        self.history.push_back(Sample { at: now, stats });
    }

    pub(crate) fn coverage_ms(&self, now: u64) -> u64 {
        self.history
            .iter()
            .find(|sample| sample.stats.is_some())
            .map_or(0, |first| now.saturating_sub(first.at).min(WINDOW_MS))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn retains_only_last_thirty_minutes_and_bounds_capacity() {
        let mut feed = HostFeed::default();
        for step in 0..1000 {
            feed.push_at(Ok(HostStats::default()), step * 2000);
        }
        assert_eq!(feed.history.len(), CAPACITY);
        assert_eq!(feed.history.front().unwrap().at, 198_000);
        feed.push_at(Ok(HostStats::default()), 4_000_000);
        assert_eq!(feed.history.len(), 1);
    }

    #[test]
    fn failure_retains_last_value_but_inserts_gap_and_resets_baseline() {
        let mut feed = HostFeed::default();
        feed.push_at(Ok(HostStats::default()), 1000);
        assert!(!feed.needs_baseline(3000));
        assert!(feed.needs_baseline(10_000));
        feed.push_at(Err("busy".into()), 3000);
        assert!(feed.latest.is_some());
        assert!(feed.history.back().unwrap().stats.is_none());
        assert!(feed.needs_baseline(5000));
        assert_eq!(feed.updated_at, Some(1000));
    }

    #[test]
    fn backward_clock_starts_new_timeline() {
        let mut feed = HostFeed::default();
        feed.push_at(Ok(HostStats::default()), 5000);
        assert!(feed.needs_baseline(1000));
        feed.push_at(Ok(HostStats::default()), 1000);
        assert_eq!(feed.history.len(), 1);
    }
}
