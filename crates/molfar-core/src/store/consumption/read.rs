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
        self.conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1)",
            [LEDGER_TABLE],
            |row| row.get(0),
        )
    }
}

pub(in crate::store) fn record(row: &Row<'_>) -> rusqlite::Result<UsageRecord> {
    let input = count(row, 6)?;
    let tokens = match input {
        Some(input) => Some(TokenCounts {
            input,
            output: count(row, 7)?.unwrap_or(0),
            cache_read: count(row, 8)?.unwrap_or(0),
            cache_write: count(row, 9)?.unwrap_or(0),
        }),
        None => None,
    };

    Ok(UsageRecord {
        source_key: row.get(0)?,
        provider: row.get(1)?,
        model_id: row.get(2)?,
        model_name: row.get(3)?,
        started_at_ms: count(row, 4)?,
        reported_at_ms: count(row, 5)?,
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
