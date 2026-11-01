use super::Store;
use crate::{
    agent::Settings,
    task_board::stage::lifecycle::{
        constants::{ACCEPTED, PREPARED},
        storage::query,
        types::ReservedGrillSession,
    },
};
use rusqlite::{params, OptionalExtension, Transaction, TransactionBehavior};
use serde_json::json;
use std::collections::HashSet;

impl Store {
    pub fn session_task_card(&self, id: i64) -> Result<Option<String>, String> {
        if self.shared.is_none() {
            return Ok(None);
        }
        self.conn
            .query_row(
                "SELECT task_card_id FROM sessions WHERE id=?1",
                [self.persisted_session_id(id)?],
                |r| r.get(0),
            )
            .optional()
            .map(|value| value.flatten())
            .map_err(|e| e.to_string())
    }

    pub fn board_owned_session_ids(&self) -> Result<HashSet<i64>, String> {
        if self.shared.is_none() {
            return Ok(HashSet::new());
        }
        let mut statement = self
            .conn
            .prepare("SELECT id FROM sessions WHERE task_card_id IS NOT NULL AND task_card_id!=''")
            .map_err(|e| e.to_string())?;
        let originals = statement
            .query_map([], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        originals
            .iter()
            .map(|id| self.resolve_session_id(id))
            .collect()
    }

    pub fn board_reserve_grill_session(
        &mut self,
        id: &str,
        settings: &Settings,
        prompt: &str,
    ) -> Result<ReservedGrillSession, String> {
        self.board_writable()?;
        if self.shared.is_none() {
            return Err("Board stage sessions require the desktop schema.".into());
        }
        let context = query::context(&self.conn, id)?;
        if !query::current(&self.conn, &context)? {
            return Err("Board stage no longer owns its card.".into());
        }
        if ![ACCEPTED, PREPARED].contains(&context.run.dispatch.as_str()) {
            return Err("Board stage has already been submitted.".into());
        }
        let worktree = context
            .card
            .worktree_path
            .as_ref()
            .ok_or("Board stage has no retained checkout.")?;
        if settings.model != crate::store::native_model(&context.run.model, &context.run.harness)
            || serde_json::to_value(&settings.model_settings).map_err(|e| e.to_string())?
                != serde_json::from_str::<serde_json::Value>(&context.run.settings_json)
                    .map_err(|e| e.to_string())?
        {
            return Err("Board model differs from the accepted run.".into());
        }
        if settings.access.id() != context.run.runtime_mode {
            return Err("Board permission mode differs from the accepted run.".into());
        }
        let mut settings = settings.clone();
        settings.worktree_cwd = Some(worktree.clone());
        settings.new_worktree = false;
        settings.worktree_removed = false;
        settings.operator = false;
        settings.operator_enabled = false;
        settings.orchestrator = false;
        settings.familiar = None;
        settings.internal_message = false;
        settings.turns.clear();
        settings.turn_model = None;
        settings.pending_provider_switch = None;
        let input=json!({"run":id,"model":context.run.model,"settings":context.run.settings_json,"mode":context.run.runtime_mode,"account":settings.account.id,"worktree":worktree,"prompt":prompt}).to_string();
        let fingerprint = crate::familiar::files::content_hash(&input);
        let key = format!("board-stage-request:{id}");
        if self
            .setting(&key)?
            .is_some_and(|saved| saved != fingerprint)
        {
            return Err("Board request was already prepared with different input.".into());
        }
        self.save_setting(&key, &fingerprint)?;

        let tx = Transaction::new_unchecked(&self.conn, TransactionBehavior::Immediate)
            .map_err(|e| e.to_string())?;
        let current = query::context(&tx, id)?;
        if !query::current(&tx, &current)? {
            return Err("Board stage was cancelled during preparation.".into());
        }
        let original = format!("board-{id}");
        let (mut session, _) =
            self.shared_create_named(&context.run.harness, &context.card.project_cwd, &original)?;
        let owner: Option<String> = tx
            .query_row(
                "SELECT task_card_id FROM sessions WHERE id=?1",
                [&original],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        if owner
            .as_ref()
            .is_some_and(|owner| owner != &context.card.id)
            || current
                .run
                .session_id
                .as_ref()
                .is_some_and(|saved| saved != &original)
        {
            return Err("Board session belongs to a different run or card.".into());
        }
        let title = format!("#{} · Grill · {}", context.card.number, context.card.title);
        tx.execute(
            "UPDATE sessions SET task_card_id=?2,title=?3 WHERE id=?1",
            params![original, context.card.id, title],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            "UPDATE task_board_stage_runs SET session_id=?2 WHERE id=?1",
            params![id, original],
        )
        .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        self.configure_agent(session.id, &context.run.harness, &settings)?;
        self.prepare_app_prompt(session.id, id, prompt)?;
        session.title = title;
        Ok(ReservedGrillSession { session })
    }
}
