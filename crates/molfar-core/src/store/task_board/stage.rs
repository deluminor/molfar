use super::Store;
use crate::{
    app_access::turn::StoredAppTurn,
    task_board::constants::GRILL,
    task_board::{
        stage::{
            checkout::types::{CheckoutSnapshot, RetainedCheckout},
            choice::types::ResolvedStageChoice,
            lifecycle::{
                constants::RUNNING,
                storage::{claim, progress, query, settlement},
                types::{FailureStatus, GrillContext, StageEffect, VerifiedGrillOutput},
            },
        },
        types::StageRun,
    },
};
use rusqlite::OptionalExtension;
use std::collections::HashSet;

impl Store {
    pub fn board_settings_json(&self) -> Result<Option<String>, String> {
        self.conn
            .query_row("SELECT json FROM task_board_settings WHERE id=1", [], |r| {
                r.get(0)
            })
            .optional()
            .map_err(|e| e.to_string())
    }

    pub fn board_accept_grill(
        &mut self,
        id: &str,
        expected: i64,
        run: &str,
        choice: &ResolvedStageChoice,
    ) -> Result<GrillContext, String> {
        self.board_writable()?;
        claim::accept(&mut self.conn, id, expected, run, choice)
    }

    pub fn board_grill_context(&self, id: &str) -> Result<Option<GrillContext>, String> {
        let run: Option<StageRun> = self
            .conn
            .query_row(
                &format!("{} WHERE id=?1", crate::task_board::read::RUNS_SELECT),
                [id],
                crate::task_board::read::runs_row,
            )
            .optional()
            .map_err(|e| e.to_string())?;
        run.map(|run| query::card(&self.conn, &run.card_id).map(|card| GrillContext { card, run }))
            .transpose()
    }

    pub fn board_grill_is_current(&self, id: &str) -> Result<bool, String> {
        self.board_grill_context(id)?
            .map(|ctx| query::current(&self.conn, &ctx))
            .unwrap_or(Ok(false))
    }

    pub fn board_running_grills(&self) -> Result<Vec<GrillContext>, String> {
        let mut statement = self
            .conn
            .prepare(
                "SELECT id FROM task_board_stage_runs WHERE stage=?1 AND status=?2 ORDER BY rowid",
            )
            .map_err(|e| e.to_string())?;
        let ids = statement
            .query_map([GRILL, RUNNING], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        ids.iter()
            .map(|id| query::context(&self.conn, id))
            .collect()
    }

    pub fn board_record_grill_worktree(
        &mut self,
        id: &str,
        tree: &RetainedCheckout,
    ) -> Result<Option<GrillContext>, String> {
        self.board_writable()?;
        progress::worktree(&mut self.conn, id, tree)
    }

    pub fn board_record_grill_prepared(
        &mut self,
        id: &str,
        snapshot: &CheckoutSnapshot,
        session: &str,
    ) -> Result<Option<GrillContext>, String> {
        self.board_writable()?;
        progress::prepared(&mut self.conn, id, snapshot, session)
    }

    pub fn board_record_grill_submitted(&mut self, id: &str) -> Result<bool, String> {
        self.board_writable()?;
        if self.board_grill_result(id)?.is_none() {
            return Ok(false);
        }
        progress::submitted(&mut self.conn, id)
    }

    pub fn board_grill_result(&self, id: &str) -> Result<Option<StoredAppTurn>, String> {
        let Some(ctx) = self.board_grill_context(id)? else {
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

    pub fn board_finish_grill(
        &mut self,
        id: &str,
        output: &VerifiedGrillOutput,
    ) -> Result<StageEffect, String> {
        self.board_writable()?;
        if !self.board_grill_is_current(id)? {
            return Ok(StageEffect::default());
        }
        let result = self
            .board_grill_result(id)?
            .ok_or("Grill has no exact persisted app turn.")?;
        if !matches!(
            result.completion,
            Some(crate::agent::turn::TurnCompletion::Succeeded { .. })
        ) {
            return Err("Grill has no successful durable completion.".into());
        }
        let parsed = crate::task_board::stage::contracts::read_grill_output(&result.text)?;
        if parsed != output.artifacts {
            return Err("Grill artifacts differ from the exact persisted turn.".into());
        }
        let base = self.board_artifact_base()?;
        settlement::finish(&mut self.conn, &base, id, output)
    }

    pub fn board_fail_grill(
        &mut self,
        id: &str,
        status: FailureStatus,
        error: &str,
    ) -> Result<StageEffect, String> {
        self.board_writable()?;
        settlement::fail(&mut self.conn, id, status, error)
    }

    pub fn board_fail_claimed_grill(
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
        for card in cards
            .into_iter()
            .filter(|c| c.column_id == GRILL && c.run_state == RUNNING && !active.contains(&c.id))
        {
            let latest = query::latest_id(&self.conn, &card.id)?;
            if latest
                .map(|id| query::run(&self.conn, &id))
                .transpose()?
                .is_some_and(|r| r.status == RUNNING)
            {
                continue;
            }
            let effect = self.board_fail_claimed_grill(
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
