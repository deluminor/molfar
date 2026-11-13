use super::SCHEMA;
use crate::{consumption::UsageRecord, store::Store};
use rusqlite::{params, Transaction};

const UPSERT: &str = "INSERT INTO native_consumption_v1
    (session_id,source_key,provider,model_id,model_name,started_at_ms,reported_at_ms,
     input,output,cache_read,cache_write)
    VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)";

const REPLACE: &str = " ON CONFLICT(session_id,source_key) DO UPDATE SET
    provider=excluded.provider,model_id=excluded.model_id,model_name=excluded.model_name,
    started_at_ms=COALESCE(native_consumption_v1.started_at_ms,excluded.started_at_ms),
    reported_at_ms=COALESCE(native_consumption_v1.reported_at_ms,excluded.reported_at_ms),
    input=excluded.input,output=excluded.output,
    cache_read=excluded.cache_read,cache_write=excluded.cache_write";

impl Store {
    /// The authoritative report of one run replaces its earlier snapshot; the first report
    /// date survives replay, and transcript edits or rewinds never delete ledger rows.
    pub fn save_consumption(&self, session: i64, record: &UsageRecord) -> Result<(), String> {
        let session = self.ledger_session(session)?;
        record.validate()?;

        self.ledger_transaction(|tx| upsert(tx, &format!("{UPSERT}{REPLACE}"), &session, record))
            .map_err(|error| {
                format!(
                    "Save consumption session={session} source={}: {error}",
                    record.source_key
                )
            })
    }

    fn ledger_session(&self, session: i64) -> Result<String, String> {
        if self.shared.is_some() {
            self.shared_writable()?;
        }
        self.persisted_session_id(session)
    }

    fn ledger_transaction(
        &self,
        work: impl FnOnce(&Transaction<'_>) -> rusqlite::Result<()>,
    ) -> rusqlite::Result<()> {
        let tx = self.conn.unchecked_transaction()?;
        tx.execute_batch(SCHEMA)?;
        work(&tx)?;
        tx.commit()
    }
}

fn upsert(
    tx: &Transaction<'_>,
    statement: &str,
    session: &str,
    record: &UsageRecord,
) -> rusqlite::Result<()> {
    let count = |value: u64| i64::try_from(value).ok();
    let tokens = record.tokens;
    tx.execute(
        statement,
        params![
            session,
            record.source_key,
            record.provider,
            record.model_id,
            record.model_name,
            record.started_at_ms.and_then(count),
            record.reported_at_ms.and_then(count),
            tokens.and_then(|t| count(t.input)),
            tokens.and_then(|t| count(t.output)),
            tokens.and_then(|t| count(t.cache_read)),
            tokens.and_then(|t| count(t.cache_write)),
        ],
    )?;

    Ok(())
}
