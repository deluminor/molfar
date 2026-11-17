//! A stage run is a streak of turns in one session; the timeline shows it as one entry.
use molfar_core::task_board::{stage::lifecycle::constants::PARTIAL, types::StageRun};
use std::collections::HashMap;

pub(super) struct Entry<'a> {
    pub first: &'a StageRun,
    pub last: &'a StageRun,
    pub turns: usize,
    pub compactions: usize,
}

impl Entry<'_> {
    /// "4 turns · 2 compactions", or `None` for one turn that never compacted.
    pub fn summary(&self) -> Option<String> {
        let mut parts = Vec::new();
        if self.turns > 1 {
            parts.push(format!("{} turns", self.turns));
        }
        match self.compactions {
            0 => {}
            1 => parts.push("1 compaction".to_owned()),
            count => parts.push(format!("{count} compactions")),
        }
        (!parts.is_empty()).then(|| parts.join(" · "))
    }
}

/// A run folds into the entry before it when that entry's latest turn reported `partial`
/// in the same stage and the same session; anything else starts a new entry.
pub(super) fn fold<'a>(
    runs: &'a [StageRun],
    compactions: &HashMap<String, usize>,
) -> Vec<Entry<'a>> {
    let mut entries: Vec<Entry<'a>> = Vec::new();
    for run in runs {
        let count = compactions.get(&run.id).copied().unwrap_or(0);
        if let Some(entry) = entries
            .last_mut()
            .filter(|entry| continues(entry.last, run))
        {
            entry.last = run;
            entry.turns += 1;
            entry.compactions += count;
            continue;
        }

        entries.push(Entry {
            first: run,
            last: run,
            turns: 1,
            compactions: count,
        });
    }
    entries
}

fn continues(previous: &StageRun, run: &StageRun) -> bool {
    previous.status == PARTIAL
        && previous.stage == run.stage
        && previous.session_id.is_some()
        && previous.session_id == run.session_id
}
