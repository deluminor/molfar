use super::Store;
use crate::task_board::{
    constants::TASK,
    stage::{contracts::types::HandoffInput, lifecycle::artifacts},
    types::ArtifactMeta,
};
use rusqlite::{params, OptionalExtension};
use std::path::PathBuf;

impl Store {
    pub(super) fn board_artifact_base(&self) -> Result<PathBuf, String> {
        self.data_dir()
            .map(|p| p.join("task-board"))
            .ok_or_else(|| "Board artifacts require a file-backed database.".into())
    }

    pub fn board_grill_input(&self, card: &str) -> Result<HandoffInput, String> {
        let version:i64=self.conn.query_row("SELECT version FROM task_board_artifacts WHERE card_id=?1 AND kind=?2 ORDER BY version DESC LIMIT 1",params![card,TASK],|r|r.get(0)).optional().map_err(|e|e.to_string())?.ok_or("Board card has no initial task artifact.")?;
        Ok(HandoffInput {
            kind: "task".into(),
            version,
            body: self.board_stage_artifact(card, "task", version)?,
        })
    }

    pub fn board_stage_artifact(
        &self,
        card: &str,
        kind: &str,
        version: i64,
    ) -> Result<String, String> {
        let exists:bool=self.conn.query_row("SELECT EXISTS(SELECT 1 FROM task_board_artifacts WHERE card_id=?1 AND kind=?2 AND version=?3)",params![card,kind,version],|r|r.get(0)).map_err(|e|e.to_string())?;
        if !exists {
            return Err("Board artifact not found.".into());
        }
        artifacts::read(&self.board_artifact_base()?, card, kind, version)
    }

    pub fn board_stage_artifacts(&self, card: &str) -> Result<Vec<ArtifactMeta>, String> {
        self.conn
            .prepare(&format!(
                "{} WHERE card_id=?1 ORDER BY kind,version",
                crate::task_board::read::ARTIFACTS_SELECT
            ))
            .map_err(|e| e.to_string())?
            .query_map([card], crate::task_board::read::artifacts_row)
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }
}
