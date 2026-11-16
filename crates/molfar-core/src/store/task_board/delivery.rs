use super::Store;
use crate::task_board::{
    delivery::{
        storage,
        types::{Delivery, DeliveryMethod},
        waiting,
    },
    stage::{lifecycle::storage::query, owner},
    types::Card,
};

impl Store {
    pub fn board_card(&self, id: &str) -> Result<Card, String> {
        query::card(&self.conn, id)
    }

    pub fn board_latest_artifact(&self, card: &str, kind: &str) -> Result<Option<String>, String> {
        owner::latest(&self.conn, card, kind)?
            .map(|version| self.board_stage_artifact(card, kind, version))
            .transpose()
    }

    pub fn board_deliver_start(&mut self, id: &str, expected: i64) -> Result<Card, String> {
        self.board_writable()?;
        storage::start(&mut self.conn, id, expected)
    }

    pub fn board_save_delivery(&mut self, id: &str, delivery: &Delivery) -> Result<Card, String> {
        self.board_writable()?;
        storage::save_progress(&mut self.conn, id, delivery)
    }

    pub fn board_finish_delivery(
        &mut self,
        id: &str,
        delivery: &Delivery,
        worktree_removed: bool,
        warning: Option<&str>,
    ) -> Result<Card, String> {
        self.board_writable()?;
        let base = self.board_artifact_base()?;
        storage::finish(
            &mut self.conn,
            &base,
            id,
            delivery,
            worktree_removed,
            warning,
        )
    }

    pub fn board_fail_delivery(&mut self, id: &str, error: &str) -> Result<Card, String> {
        self.board_writable()?;
        storage::fail(&mut self.conn, id, error)
    }

    /// Returns the card before and after archiving so cleanup can use the old worktree.
    pub fn board_reject(&mut self, id: &str, expected: i64) -> Result<(Card, Card), String> {
        self.board_writable()?;
        storage::reject(&mut self.conn, id, expected)
    }

    pub fn board_note_archived(
        &mut self,
        id: &str,
        worktree: Option<&str>,
        error: &str,
    ) -> Result<Card, String> {
        self.board_writable()?;
        storage::note_archived(&mut self.conn, id, worktree, error)
    }

    /// Native-only databases have no Board, so nothing can be stuck there.
    pub fn board_stuck_deliveries(&self) -> Result<Vec<String>, String> {
        if self.shared.is_none() {
            return Ok(Vec::new());
        }
        storage::stuck(&self.conn)
    }

    /// The pull request is open: hold the card at Final review until CI decides.
    pub fn board_await_ci(&mut self, id: &str, delivery: &Delivery) -> Result<Card, String> {
        self.board_writable()?;
        waiting::await_ci(&mut self.conn, id, delivery)
    }

    pub fn board_waiting_ci(&self) -> Result<Vec<Card>, String> {
        if self.shared.is_none() {
            return Ok(Vec::new());
        }
        waiting::waiting(&self.conn)
    }

    pub fn board_ci_passed(&mut self, id: &str, expected: i64) -> Result<Card, String> {
        self.board_writable()?;
        waiting::ci_passed(&mut self.conn, id, expected)
    }

    pub fn board_ci_failed(
        &mut self,
        id: &str,
        expected: i64,
        brief: &str,
    ) -> Result<Card, String> {
        self.board_writable()?;
        let base = self.board_artifact_base()?;
        waiting::ci_failed(&mut self.conn, &base, id, expected, brief)
    }

    pub fn board_redeliveries(&self) -> Result<Vec<(String, i64, DeliveryMethod)>, String> {
        if self.shared.is_none() {
            return Ok(Vec::new());
        }
        let base = self.board_artifact_base()?;
        waiting::redeliveries(&self.conn, &base)
    }
}
