use super::Store;
use crate::{
    app_access::turn::StoredAppTurn,
    task_board::stage::agent::AgentStage,
    task_board::{
        stage::{
            checkout::types::{CheckoutSnapshot, RetainedCheckout},
            choice::types::ResolvedStageChoice,
            lifecycle::{
                constants::RUNNING,
                storage::{checks, claim, outcome, progress, query, settlement},
                types::{FailureStatus, StageContext, StageEffect, VerifiedStageOutput},
            },
        },
        types::StageRun,
    },
};
use rusqlite::OptionalExtension;
use std::collections::HashSet;

impl Store {
    pub fn board_accept_stage(
        &mut self,
        id: &str,
        expected: i64,
        run: &str,
        choice: &ResolvedStageChoice,
    ) -> Result<StageContext, String> {
        self.board_writable()?;
        claim::accept(&mut self.conn, id, expected, run, choice)
    }

    pub fn board_stage_context(&self, id: &str) -> Result<Option<StageContext>, String> {
        let run: Option<StageRun> = self
            .conn
            .query_row(
                &format!("{} WHERE id=?1", crate::task_board::read::RUNS_SELECT),
                [id],
                crate::task_board::read::runs_row,
            )
            .optional()
            .map_err(|e| e.to_string())?;
        run.map(|run| query::card(&self.conn, &run.card_id).map(|card| StageContext { card, run }))
            .transpose()
    }

    /// Red checks before a code review: send the card back to Rework, or `None` when the
    /// automatic budget is spent and the review should run with the failure in its prompt.
    pub fn board_stage_checks_failed(
        &mut self,
        id: &str,
        summary: &str,
    ) -> Result<Option<StageEffect>, String> {
        self.board_writable()?;
        let base = self.board_artifact_base()?;
        checks::redirect(&mut self.conn, &base, id, summary)
    }

    /// The commit the latest successful code review of this card looked at.
    pub fn board_reviewed_head(&self, card: &str) -> Result<Option<String>, String> {
        self.conn
            .query_row(
                "SELECT head_before FROM task_board_stage_runs WHERE card_id=?1 AND stage=?2 AND status=?3 ORDER BY rowid DESC LIMIT 1",
                rusqlite::params![card, crate::task_board::constants::CODE_REVIEW, crate::task_board::stage::lifecycle::constants::SUCCEEDED],
                |row| row.get::<_, Option<String>>(0),
            )
            .optional()
            .map(Option::flatten)
            .map_err(|e| e.to_string())
    }

    /// The continuation number for a run's prompt: 0 for a fresh start.
    pub fn board_stage_continuation(&self, id: &str) -> Result<i64, String> {
        let Some(ctx) = self.board_stage_context(id)? else {
            return Ok(0);
        };
        let streak = outcome::continuation(&self.conn, &ctx.card.id, id)?;
        i64::try_from(streak).map_err(|e| e.to_string())
    }

    pub fn board_stage_is_current(&self, id: &str) -> Result<bool, String> {
        self.board_stage_context(id)?
            .map(|ctx| query::current(&self.conn, &ctx))
            .unwrap_or(Ok(false))
    }

    pub fn board_running_stages(&self) -> Result<Vec<StageContext>, String> {
        let mut statement = self
            .conn
            .prepare("SELECT id FROM task_board_stage_runs WHERE status=?1 ORDER BY rowid")
            .map_err(|e| e.to_string())?;
        let ids = statement
            .query_map([RUNNING], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        ids.iter()
            .map(|id| query::context(&self.conn, id))
            .collect()
    }

    pub fn board_record_stage_worktree(
        &mut self,
        id: &str,
        tree: &RetainedCheckout,
    ) -> Result<Option<StageContext>, String> {
        self.board_writable()?;
        progress::worktree(&mut self.conn, id, tree)
    }

    pub fn board_record_stage_prepared(
        &mut self,
        id: &str,
        snapshot: &CheckoutSnapshot,
        session: &str,
    ) -> Result<Option<StageContext>, String> {
        self.board_writable()?;
        progress::prepared(&mut self.conn, id, snapshot, session)
    }

    pub fn board_record_stage_submitted(&mut self, id: &str) -> Result<bool, String> {
        self.board_writable()?;
        if self.board_stage_result(id)?.is_none() {
            return Ok(false);
        }
        progress::submitted(&mut self.conn, id)
    }

    pub fn board_stage_result(&self, id: &str) -> Result<Option<StoredAppTurn>, String> {
        let Some(ctx) = self.board_stage_context(id)? else {
            return Ok(None);
        };
        if !query::current(&self.conn, &ctx)? {
            return Ok(None);
        }
        let Some(original) = &ctx.run.session_id else {
            return Ok(None);
        };
        let exists: bool = self
            .conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM sessions WHERE id=?1)",
                [original],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        if !exists {
            return Ok(None);
        }
        let native = self.resolve_session_id(original)?;
        if self.session_task_card(native)?.as_deref() != Some(ctx.card.id.as_str()) {
            return Err("Board session belongs to a different card.".into());
        }
        self.app_turn_result(native, id)
    }

    pub fn board_finish_stage(
        &mut self,
        id: &str,
        output: &VerifiedStageOutput,
    ) -> Result<StageEffect, String> {
        self.board_writable()?;
        if !self.board_stage_is_current(id)? {
            return Ok(StageEffect::default());
        }
        let result = self
            .board_stage_result(id)?
            .ok_or("Board stage has no exact persisted app turn.")?;
        if !matches!(
            result.completion,
            Some(crate::agent::turn::TurnCompletion::Succeeded { .. })
        ) {
            return Err("Board stage has no successful durable completion.".into());
        }
        let context = self
            .board_stage_context(id)?
            .ok_or("Board run not found.")?;
        let stage = AgentStage::parse(&context.run.stage).ok_or("Unsupported Board stage.")?;
        let parsed = crate::task_board::stage::contracts::read_stage_output(stage, &result.text)?;
        if parsed != output.artifacts {
            return Err("Board stage artifacts differ from the exact persisted turn.".into());
        }
        let base = self.board_artifact_base()?;
        settlement::finish(&mut self.conn, &base, id, output)
    }

    pub fn board_fail_stage(
        &mut self,
        id: &str,
        status: FailureStatus,
        error: &str,
    ) -> Result<StageEffect, String> {
        self.board_writable()?;
        settlement::fail(&mut self.conn, id, status, error)
    }

    pub fn board_fail_claimed_stage(
        &mut self,
        id: &str,
        expected: i64,
        error: &str,
    ) -> Result<StageEffect, String> {
        self.board_writable()?;
        settlement::fail_claim(&mut self.conn, id, expected, error)
    }

    pub fn board_reconcile_orphan_claims(
        &mut self,
        active: &HashSet<String>,
    ) -> Result<Vec<StageEffect>, String> {
        self.board_writable()?;
        let cards = self.board_snapshot(None, false, None)?.cards;
        let mut effects = Vec::new();
        for card in cards.into_iter().filter(|c| {
            AgentStage::parse(&c.column_id).is_some()
                && c.run_state == RUNNING
                && !active.contains(&c.id)
        }) {
            let latest = query::latest_id(&self.conn, &card.id)?;
            if latest
                .map(|id| query::run(&self.conn, &id))
                .transpose()?
                .is_some_and(|r| r.status == RUNNING)
            {
                continue;
            }
            let effect = self.board_fail_claimed_stage(
                &card.id,
                card.updated_at,
                "Interrupted before a Board stage run was accepted. Retry explicitly.",
            )?;
            if effect.changed {
                effects.push(effect);
            }
        }
        Ok(effects)
    }
}
