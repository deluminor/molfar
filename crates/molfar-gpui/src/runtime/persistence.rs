//! UI batches stay responsive while the shared JSON transcript is saved at a
//! bounded cadence. Delivery receipts and settled turns always flush immediately.
use super::*;
use std::time::Instant;

// Match the desktop's routine-save window. Accepted messages and settled turns
// still commit immediately, independently of this streaming debounce.
const SHARED_SAVE_INTERVAL: Duration = Duration::from_millis(650);

pub(super) struct PendingSave {
    from: Option<usize>,
    context_dirty: bool,
    last_flush: Instant,
    interval: Duration,
    context_owner: Option<(String, String)>,
}

impl PendingSave {
    pub(super) fn new(shared: bool, now: Instant) -> Self {
        Self {
            from: None,
            context_dirty: false,
            last_flush: now,
            interval: if shared {
                SHARED_SAVE_INTERVAL
            } else {
                Duration::ZERO
            },
            context_owner: None,
        }
    }

    pub(super) fn own_context(&mut self, provider: &str, account: &str) {
        self.context_owner = Some((provider.into(), account.into()));
    }

    pub(super) fn changed(&mut self, row: usize) {
        self.from = Some(self.from.map_or(row, |old| old.min(row)));
    }

    pub(super) fn context_changed(&mut self) {
        self.context_dirty = true;
    }

    pub(super) fn due(&self, boundary: bool, now: Instant) -> bool {
        (self.from.is_some() || self.context_dirty)
            && (boundary || now.saturating_duration_since(self.last_flush) >= self.interval)
    }

    pub(super) fn flush(
        &mut self,
        store: &Database,
        session: i64,
        transcript: &Transcript,
        context: &molfar_core::context::Usage,
        now: Instant,
    ) -> Result<(), String> {
        if self.from.is_none() && !self.context_dirty {
            return Ok(());
        }
        let mut store = locked(store)?;
        if let Some(from) = self.from {
            store.write_rows(session, from, &transcript.rows[from..])?;
        }
        if self.context_dirty {
            let selected = if let Some((provider, account)) = &self.context_owner {
                store
                    .agent_settings(session)?
                    .is_some_and(|settings| settings.account.id == *account)
                    && store
                        .sessions()?
                        .iter()
                        .any(|current| current.id == session && current.provider == *provider)
            } else {
                true
            };
            if selected {
                store.save_context_usage(session, context)?;
            }
        }
        // Keep pending changes after a failed write so final cleanup retries.
        self.from = None;
        self.context_dirty = false;
        self.last_flush = now;
        Ok(())
    }

    pub(super) fn accept(
        &mut self,
        store: &Database,
        session: i64,
        from: usize,
        transcript: &Transcript,
        message: &str,
        now: Instant,
    ) -> Result<(), String> {
        let from = self.from.map_or(from, |old| old.min(from));
        locked(store)?.write_rows_with_message(
            session,
            from,
            &transcript.rows[from..],
            Some(message),
        )?;
        self.from = None;
        self.last_flush = now;
        Ok(())
    }
}

pub(super) fn save_turn_receipt(
    store: &Database,
    session: i64,
    turn: usize,
    info: molfar_core::agent::TurnInfo,
) -> Result<(), String> {
    locked(store)?.save_turn_receipt(session, turn, &info)
}

#[cfg(test)]
mod fixtures;
#[cfg(test)]
mod tests;
#[cfg(test)]
mod turn_tests;
#[cfg(test)]
mod worktree_tests;
