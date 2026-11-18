use super::Store;
use crate::task_board::{constants::IDLE, read, types::Card};
use rusqlite::{params, TransactionBehavior};

impl Store {
    /// Caller authorization must precede this operation; revision checks and
    /// idle/unqueued eligibility are enforced within the write transaction.
    pub fn board_set_archived(
        &mut self,
        id: &str,
        expected: i64,
        archived: bool,
    ) -> Result<Card, String> {
        self.board_writable()?;
        let tx = self
            .conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|error| error.to_string())?;
        let mut card = read::card(&tx, id)
            .map_err(|error| error.to_string())?
            .ok_or("Board card not found.")?;
        if card.updated_at != expected {
            return Err("conflict: the card changed; reload and try again".into());
        }
        if card.run_state != IDLE || card.queued_at.is_some() {
            return Err("conflict: the card must be idle and unqueued".into());
        }
        if card.archived != archived {
            card.updated_at = chrono::Utc::now()
                .timestamp_millis()
                .max(expected.checked_add(1).ok_or("Card revision overflow")?);
            tx.execute(
                "UPDATE task_board_cards SET archived=?2,updated_at=?3 WHERE id=?1",
                params![id, archived, card.updated_at],
            )
            .map_err(|error| error.to_string())?;
            card.archived = archived;
        }
        tx.commit().map_err(|error| error.to_string())?;
        Ok(card)
    }
}

#[cfg(test)]
mod tests;
