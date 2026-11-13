use crate::{home::data::feeds::Load, popover::AnchorSlot};
use molfar_core::consumption::summary::{Reporting, UsageSummary};

/// A conversation's cached usage summary; render only reads it.
pub(crate) struct SessionUsage {
    pub load: Load<UsageSummary>,
    /// The last good summary stays on screen while a refresh runs or fails.
    pub shown: Option<UsageSummary>,
    pub generation: u64,
    pub hovered: bool,
    pub anchor: AnchorSlot,
}

impl Default for SessionUsage {
    fn default() -> Self {
        Self {
            load: Load::Loading,
            shown: None,
            generation: 0,
            hovered: false,
            anchor: AnchorSlot::default(),
        }
    }
}

impl SessionUsage {
    pub(crate) fn begin(&mut self) -> u64 {
        self.generation += 1;
        self.load = Load::Loading;
        self.generation
    }

    /// Ignores results of superseded refreshes.
    pub(crate) fn finish(&mut self, generation: u64, result: Result<UsageSummary, String>) -> bool {
        if generation != self.generation {
            return false;
        }
        match result {
            Ok(summary) => {
                self.shown = Some(summary);
                self.load = Load::Ready(summary);
            }
            Err(error) => {
                eprintln!("molfar: session usage failed: {error}");
                self.load = Load::Failed(error);
            }
        }

        true
    }

    /// What the composer chip shows: nothing until a session has any recorded run.
    pub(crate) fn visible(&self) -> Option<UsageSummary> {
        self.shown
            .filter(|summary| summary.reporting() != Reporting::Empty)
    }

    pub(crate) fn error(&self) -> Option<&str> {
        match &self.load {
            Load::Failed(error) => Some(error),
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stale_results_are_dropped_and_failures_keep_the_last_summary() {
        let mut usage = SessionUsage::default();
        let first = usage.begin();
        let second = usage.begin();

        assert!(!usage.finish(first, Ok(UsageSummary::default())));
        let reported = UsageSummary {
            reported_runs: 1,
            ..Default::default()
        };
        assert!(usage.finish(second, Ok(reported)));
        assert_eq!(usage.visible(), Some(reported));

        let third = usage.begin();
        assert!(usage.finish(third, Err("locked".into())));
        assert_eq!(usage.visible(), Some(reported));
        assert_eq!(usage.error(), Some("locked"));
    }

    #[test]
    fn empty_sessions_show_no_chip() {
        let mut usage = SessionUsage::default();
        let generation = usage.begin();
        usage.finish(generation, Ok(UsageSummary::default()));

        assert_eq!(usage.visible(), None);
    }
}
