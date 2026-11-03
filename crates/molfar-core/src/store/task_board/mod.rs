use super::Store;
mod artifacts;
mod delivery;
mod notices;
mod session;
mod settings;
mod stage;
mod submission;
use crate::task_board::types::{Card, CardCreate, Snapshot};

impl Store {
    pub fn board_stage_action(
        &mut self,
        id: &str,
        expected: i64,
        action: crate::task_board::stage::lifecycle::types::StageAction,
    ) -> Result<crate::task_board::stage::lifecycle::types::ActionEffect, String> {
        self.board_writable()?;
        let base = self.board_artifact_base()?;
        crate::task_board::stage::lifecycle::storage::action::apply(
            &mut self.conn,
            &base,
            id,
            expected,
            action,
        )
    }

    pub fn board_claim_next_stage(&mut self) -> Result<Option<Card>, String> {
        self.board_writable()?;
        crate::task_board::stage::lifecycle::storage::claim::next(&mut self.conn)
    }

    pub(super) fn board_writable(&self) -> Result<(), String> {
        if self.shared.is_none() {
            return Err("Native Board stages require the desktop schema.".into());
        }
        self.shared_writable()
    }
    /// Reuse the caller's ID after a partial save: an existing card is returned
    /// unchanged and missing initial task metadata is repaired. Registered
    /// artifacts are never rewritten, including externally removed files.
    pub fn board_create(
        &mut self,
        input: &CardCreate,
        projects: &[String],
    ) -> Result<Card, String> {
        if self.shared.is_some() {
            self.shared_writable()?;
        }

        let base = self
            .data_dir()
            .ok_or_else(|| "Task Board artifacts require a file-backed database.".to_owned())?
            .join("task-board");
        crate::task_board::create::create(&mut self.conn, &base, input, projects)
            .map_err(|error| format!("Cannot create Task Board card: {error}"))
    }

    pub fn board_snapshot(
        &self,
        project: Option<&str>,
        archived: bool,
        selected: Option<&str>,
    ) -> Result<Snapshot, String> {
        crate::task_board::read::snapshot(&self.conn, project, archived, selected)
    }
}
