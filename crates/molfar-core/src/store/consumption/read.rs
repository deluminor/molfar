use super::LEDGER_TABLE;
use crate::{
    consumption::{TokenCounts, UsageRecord},
    store::Store,
};
use rusqlite::Row;

pub(in crate::store) const RECORD_COLUMNS: &str =
    "source_key,provider,model_id,model_name,started_at_ms,reported_at_ms,\
     input,output,cache_read,cache_write";

impl Store {
    pub fn session_consumption(&self, session: i64) -> Result<Vec<UsageRecord>, String> {
        let session = self.persisted_session_id(session)?;
        let read = || -> rusqlite::Result<Vec<UsageRecord>> {
            if !self.ledger_exists()? {
                return Ok(Vec::new());
            }
            let mut statement = self.conn.prepare(&format!(
                "SELECT {RECORD_COLUMNS} FROM {LEDGER_TABLE}
                 WHERE session_id=?1 ORDER BY started_at_ms,source_key"
            ))?;
            let records = statement.query_map([&session], record)?.collect();
            records
        };

        read().map_err(|error| format!("Read consumption session={session}: {error}"))
    }

    pub(in crate::store) fn ledger_exists(&self) -> rusqlite::Result<bool> {
        self.table_exists(LEDGER_TABLE)
    }

    pub(super) fn table_exists(&self, name: &str) -> rusqlite::Result<bool> {
        self.conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1)",
            [name],
            |row| row.get(0),
        )
    }
}

pub(in crate::store) fn record(row: &Row<'_>) -> rusqlite::Result<UsageRecord> {
    record_from(row, 0)
}

/// Reads `RECORD_COLUMNS` starting at column `base`.
pub(in crate::store) fn record_from(row: &Row<'_>, base: usize) -> rusqlite::Result<UsageRecord> {
    let tokens = match count(row, base + 6)? {
        Some(input) => Some(TokenCounts {
            input,
            output: count(row, base + 7)?.unwrap_or(0),
            cache_read: count(row, base + 8)?.unwrap_or(0),
            cache_write: count(row, base + 9)?.unwrap_or(0),
        }),
        None => None,
    };

    Ok(UsageRecord {
        source_key: row.get(base)?,
        provider: row.get(base + 1)?,
        model_id: row.get(base + 2)?,
        model_name: row.get(base + 3)?,
        started_at_ms: count(row, base + 4)?,
        reported_at_ms: count(row, base + 5)?,
        tokens,
    })
}

fn count(row: &Row<'_>, index: usize) -> rusqlite::Result<Option<u64>> {
    row.get::<_, Option<i64>>(index)?
        .map(|value| {
            u64::try_from(value).map_err(|_| rusqlite::Error::IntegralValueOutOfRange(index, value))
        })
        .transpose()
}
