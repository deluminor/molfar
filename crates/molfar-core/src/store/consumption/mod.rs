use crate::{consumption::UsageSnapshot, store::Store};
use rusqlite::params;

#[cfg(test)]
mod tests;

impl Store {
    /// Replaces an authoritative snapshot. Delta sources must normalize before calling.
    /// First report date survives replay; transcript mutations never delete ledger records.
    pub fn save_consumption(&self, session: i64, usage: &UsageSnapshot) -> Result<(), String> {
        usage.validate()?;
        let values = [
            usage.reported_at_ms,
            usage.input,
            usage.output,
            usage.cache_read,
            usage.cache_write,
        ]
        .map(|value| value.map(i64::try_from).transpose())
        .into_iter()
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Invalid consumption count: {error}"))?;
        if self.shared.is_some() {
            self.shared_writable()?;
        }
        let session = self.persisted_session_id(session)?;
        let save = || -> rusqlite::Result<()> {
            let tx = self.conn.unchecked_transaction()?;
            tx.execute_batch(include_str!("schema.sql"))?;
            tx.execute(
                "INSERT INTO native_consumption_v1
                 (session_id,provider,source_key,model,reported_at_ms,input,output,cache_read,cache_write)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)
                 ON CONFLICT(session_id,provider,source_key) DO UPDATE SET
                 model=excluded.model,
                 reported_at_ms=COALESCE(native_consumption_v1.reported_at_ms,excluded.reported_at_ms),
                 input=excluded.input,output=excluded.output,
                 cache_read=excluded.cache_read,cache_write=excluded.cache_write",
                params![session, usage.provider, usage.source_key, usage.model,
                    values[0], values[1], values[2], values[3], values[4]],
            )?;
            tx.commit()
        };
        save().map_err(|error| {
            format!(
                "Save consumption session={session} source={}: {error}",
                usage.source_key
            )
        })
    }

    pub fn session_consumption(&self, session: i64) -> Result<Vec<UsageSnapshot>, String> {
        let session = self.persisted_session_id(session)?;
        let read = || -> rusqlite::Result<Vec<UsageSnapshot>> {
            let exists: bool = self.conn.query_row(
                "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='native_consumption_v1')",
                [], |row| row.get(0),
            )?;
            if !exists {
                return Ok(Vec::new());
            }
            let mut statement = self.conn.prepare(
                "SELECT source_key,provider,model,reported_at_ms,input,output,cache_read,cache_write
                 FROM native_consumption_v1 WHERE session_id=?1 ORDER BY provider,source_key",
            )?;
            let records = statement
                .query_map([&session], |row| {
                    Ok(UsageSnapshot {
                        source_key: row.get(0)?,
                        provider: row.get(1)?,
                        model: row.get(2)?,
                        reported_at_ms: count(row, 3)?,
                        input: count(row, 4)?,
                        output: count(row, 5)?,
                        cache_read: count(row, 6)?,
                        cache_write: count(row, 7)?,
                    })
                })?
                .collect();
            records
        };
        read().map_err(|error| format!("Read consumption session={session}: {error}"))
    }
}

fn count(row: &rusqlite::Row<'_>, index: usize) -> rusqlite::Result<Option<u64>> {
    row.get::<_, Option<i64>>(index)?
        .map(|value| {
            u64::try_from(value).map_err(|_| rusqlite::Error::IntegralValueOutOfRange(index, value))
        })
        .transpose()
}
