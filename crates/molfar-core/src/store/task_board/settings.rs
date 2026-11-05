use super::Store;
use crate::task_board::stage::choice::settings::{apply, SettingsPatch};
use rusqlite::{params, OptionalExtension, TransactionBehavior};

const SELECT_SETTINGS: &str = "SELECT json FROM task_board_settings WHERE id=1";

impl Store {
    pub fn board_settings_json(&self) -> Result<Option<String>, String> {
        self.conn
            .query_row(SELECT_SETTINGS, [], |r| r.get(0))
            .optional()
            .map_err(|e| e.to_string())
    }

    /// Applies one field-level Board settings change atomically and returns the saved JSON.
    pub fn board_update_settings(&mut self, patch: &SettingsPatch) -> Result<String, String> {
        let tx = self
            .conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|e| e.to_string())?;
        let raw: Option<String> = tx
            .query_row(SELECT_SETTINGS, [], |r| r.get(0))
            .optional()
            .map_err(|e| e.to_string())?;

        let json = apply(raw.as_deref(), patch)?;
        tx.execute(
            "INSERT INTO task_board_settings(id,json) VALUES(1,?1) ON CONFLICT(id) DO UPDATE SET json=excluded.json",
            params![json],
        )
        .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(json)
    }
}
