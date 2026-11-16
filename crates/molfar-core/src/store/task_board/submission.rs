use super::Store;
use crate::task_board::stage::lifecycle::storage::query;
use rusqlite::OptionalExtension;

impl Store {
    /// Hold the Store lock through the initial prompt write; shared writes repeat
    /// this guard inside their immediate transaction against other connections.
    pub fn board_validate_prompt_submission(
        &self,
        session: i64,
        message: Option<&str>,
    ) -> Result<(), String> {
        let Some(message) = message else {
            return Ok(());
        };
        let Some(_) = &self.shared else {
            return Ok(());
        };
        if self.shared_field("task_card_id", "NULL") == "NULL"
            || self.session_task_card(session)?.is_none()
        {
            return Ok(());
        }
        let original = self.persisted_session_id(session)?;
        let mut statement = self
            .conn
            .prepare("SELECT id FROM task_board_stage_runs WHERE session_id=?1")
            .map_err(|error| error.to_string())?;
        let runs = statement
            .query_map([&original], |row| row.get::<_, String>(0))
            .map_err(|error| error.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?;
        for run in runs {
            if super::super::app_access::prompt_message_id(&run) != message {
                continue;
            }
            let context = query::context(&self.conn, &run)?;
            let owner: Option<String> = self
                .conn
                .query_row(
                    "SELECT task_card_id FROM sessions WHERE id=?1",
                    [&original],
                    |row| row.get(0),
                )
                .optional()
                .map_err(|error| error.to_string())?
                .flatten();
            if !query::current(&self.conn, &context)? || owner.as_deref() != Some(&context.card.id)
            {
                return Err(
                    "Board stage was cancelled or replaced before prompt submission.".into(),
                );
            }
        }
        Ok(())
    }
}
