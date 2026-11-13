use super::SYNC_TABLE;
use crate::{
    consumption::UsageRecord,
    store::{Session, Store},
};
use std::collections::HashMap;

impl Store {
    /// Imports receipts of sessions whose transcript changed since their last import:
    /// legacy history, and live runs whose ledger write failed. Never deletes rows, so
    /// edits and rewinds keep incurred usage. Returns per-session failures.
    pub(super) fn reconcile_consumption(&self, sessions: &[&Session]) -> Vec<String> {
        if self.shared.is_some() && self.shared_writable().is_err() {
            return Vec::new();
        }
        let synced = match self.synced_revisions() {
            Ok(synced) => synced,
            Err(error) => return vec![error],
        };

        let mut failures = Vec::new();
        for session in sessions {
            let Ok(key) = self.persisted_session_id(session.id) else {
                continue;
            };
            if synced.get(&key) == Some(&session.updated_at) {
                continue;
            }
            if let Err(error) = self.import_session_receipts(session) {
                failures.push(error);
            }
        }

        failures
    }

    fn import_session_receipts(&self, session: &Session) -> Result<(), String> {
        let turns = self
            .agent_settings(session.id)?
            .map(|settings| settings.turns)
            .unwrap_or_default();
        let records: Vec<_> = turns.values().filter_map(UsageRecord::from_saved).collect();

        self.import_consumption(session.id, &records, session.updated_at)
    }

    fn synced_revisions(&self) -> Result<HashMap<String, u64>, String> {
        let read = || -> rusqlite::Result<HashMap<String, u64>> {
            if !self.table_exists(SYNC_TABLE)? {
                return Ok(HashMap::new());
            }
            let mut statement = self.conn.prepare(&format!(
                "SELECT session_id,source_revision FROM {SYNC_TABLE}"
            ))?;
            let rows = statement.query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
            })?;
            rows.map(|row| row.map(|(id, revision)| (id, u64::try_from(revision).unwrap_or(0))))
                .collect()
        };

        read().map_err(|error| format!("Read consumption sync state: {error}"))
    }
}
