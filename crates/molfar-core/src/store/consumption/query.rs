use super::{
    read::{record_from, RECORD_COLUMNS},
    LEDGER_TABLE,
};
use crate::{consumption::aggregate::RecordsBySession, store::Store};

const IN_CHUNK: usize = 400;
const BOARD_TABLES: [&str; 2] = ["task_board_cards", "task_board_stage_runs"];

/// A Board card and the sessions its stage runs used.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) struct CardSessions {
    pub card_id: String,
    pub number: i64,
    pub title: String,
    pub project: String,
    pub sessions: Vec<String>,
}

impl Store {
    /// Ledger rows of the given persisted session ids, read through the primary-key index.
    pub fn consumption_for(&self, sessions: &[String]) -> Result<RecordsBySession, String> {
        let mut out = RecordsBySession::new();
        let exists = self
            .ledger_exists()
            .map_err(|error| format!("Read consumption: {error}"))?;
        if !exists {
            return Ok(out);
        }

        for chunk in sessions.chunks(IN_CHUNK) {
            let marks = vec!["?"; chunk.len()].join(",");
            let mut read = || -> rusqlite::Result<()> {
                let mut statement = self.conn.prepare(&format!(
                    "SELECT session_id,{RECORD_COLUMNS} FROM {LEDGER_TABLE}
                     WHERE session_id IN ({marks})"
                ))?;
                let rows = statement.query_map(rusqlite::params_from_iter(chunk), |row| {
                    Ok((row.get::<_, String>(0)?, record_from(row, 1)?))
                })?;
                for row in rows {
                    let (session, record) = row?;
                    out.entry(session).or_default().push(record);
                }
                Ok(())
            };
            read().map_err(|error| format!("Read consumption sessions: {error}"))?;
        }

        Ok(out)
    }

    /// Cards with at least one stage run session; empty on stores without a Board.
    pub(super) fn card_sessions(&self) -> Result<Vec<CardSessions>, String> {
        let read = || -> rusqlite::Result<Vec<CardSessions>> {
            for table in BOARD_TABLES {
                if !self.table_exists(table)? {
                    return Ok(Vec::new());
                }
            }
            let mut statement = self.conn.prepare(
                "SELECT c.id,c.number,c.title,c.project_cwd,r.session_id
                 FROM task_board_cards c JOIN task_board_stage_runs r ON r.card_id=c.id
                 WHERE r.session_id IS NOT NULL ORDER BY c.number,r.started_at",
            )?;
            let mut cards: Vec<CardSessions> = Vec::new();
            let rows = statement.query_map([], |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                ))
            })?;
            for row in rows {
                let (card_id, number, title, project, session): (
                    String,
                    i64,
                    String,
                    String,
                    String,
                ) = row?;
                match cards.last_mut().filter(|card| card.card_id == card_id) {
                    Some(card) if !card.sessions.contains(&session) => card.sessions.push(session),
                    Some(_) => {}
                    None => cards.push(CardSessions {
                        card_id,
                        number,
                        title,
                        project,
                        sessions: vec![session],
                    }),
                }
            }
            Ok(cards)
        };

        read().map_err(|error| format!("Read Board usage sources: {error}"))
    }
}
