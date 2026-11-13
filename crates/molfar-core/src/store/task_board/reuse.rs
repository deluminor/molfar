//! Grill rounds share one session, and so do Implement, its continuations and Rework;
//! a reused session already knows the repository, which is where repeat tokens go.
use super::Store;
use crate::task_board::{
    constants::{CODE_REVIEW, GRILL, IMPLEMENT, REWORK},
    stage::{
        contracts::constants::PLAN,
        lifecycle::{
            constants::{COMPACT_AT, PARTIAL, SUCCEEDED},
            storage::query,
            types::SessionPlan,
        },
    },
    types::StageRun,
};
use rusqlite::{params, OptionalExtension};

fn family(stage: &str) -> &'static [&'static str] {
    match stage {
        GRILL => &[GRILL],
        IMPLEMENT | REWORK => &[IMPLEMENT, REWORK],
        CODE_REVIEW => &[],
        _ => &[],
    }
}

fn same_agent(previous: &StageRun, run: &StageRun) -> bool {
    previous.harness == run.harness
        && previous.model == run.model
        && previous.settings_json == run.settings_json
        && previous.runtime_mode == run.runtime_mode
}

impl Store {
    pub fn board_stage_session_plan(&self, id: &str) -> Result<SessionPlan, String> {
        let run = query::run(&self.conn, id)?;
        let Some(previous) = self.board_family_run(&run)? else {
            return Ok(SessionPlan::Fresh);
        };
        let Some(session) = previous.session_id.clone() else {
            return Ok(SessionPlan::Fresh);
        };

        let ended_well = [SUCCEEDED, PARTIAL].contains(&previous.status.as_str());
        if !ended_well || !same_agent(&previous, &run) || !self.board_session_open(&session)? {
            return Ok(SessionPlan::Fresh);
        }
        if run.stage != GRILL && self.board_plan_changed_since(&run.card_id, previous.started_at)? {
            return Ok(SessionPlan::Fresh);
        }

        let native = self.resolve_session_id(&session)?;
        let full = self
            .context_usage(native)?
            .and_then(|usage| usage.ratio())
            .is_some_and(|ratio| ratio >= COMPACT_AT);
        if !full {
            return Ok(SessionPlan::Reuse {
                session,
                compact: false,
            });
        }
        let compactable = crate::provider::Kind::parse(&run.harness)
            .is_some_and(crate::provider::supports_compact);
        if !compactable {
            return Ok(SessionPlan::Fresh);
        }
        Ok(SessionPlan::Reuse {
            session,
            compact: true,
        })
    }

    fn board_family_run(&self, run: &StageRun) -> Result<Option<StageRun>, String> {
        let stages = family(&run.stage);
        if stages.is_empty() {
            return Ok(None);
        }
        let placeholders = vec!["?"; stages.len()].join(",");
        let sql = format!(
            "SELECT id FROM task_board_stage_runs WHERE card_id=? AND id<>? AND stage IN ({placeholders}) ORDER BY rowid DESC LIMIT 1"
        );
        let mut values: Vec<&str> = vec![&run.card_id, &run.id];
        values.extend(stages);
        let previous: Option<String> = self
            .conn
            .query_row(&sql, rusqlite::params_from_iter(values), |row| row.get(0))
            .optional()
            .map_err(|e| e.to_string())?;
        previous.map(|id| query::run(&self.conn, &id)).transpose()
    }

    fn board_session_open(&self, session: &str) -> Result<bool, String> {
        let archived: Option<bool> = self
            .conn
            .query_row(
                "SELECT archived FROM sessions WHERE id=?1",
                [session],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        if archived != Some(false) {
            return Ok(false);
        }

        // A leftover draft or queue would swallow the run's prompt; a paused queue would hold it.
        let queue = self.follow_ups(self.resolve_session_id(session)?)?;
        Ok(queue.draft.is_none() && queue.messages.is_empty() && !queue.paused)
    }

    /// A re-grilled or edited plan makes the Build session's memory of the old plan wrong.
    fn board_plan_changed_since(&self, card: &str, since: i64) -> Result<bool, String> {
        let latest: Option<i64> = self
            .conn
            .query_row(
                "SELECT MAX(created_at) FROM task_board_artifacts WHERE card_id=?1 AND kind=?2",
                params![card, PLAN],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        Ok(latest.is_some_and(|created| created > since))
    }
}
