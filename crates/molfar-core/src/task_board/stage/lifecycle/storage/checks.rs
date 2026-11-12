//! A red verify command sends the card back to Rework before its code review starts.
use super::super::{
    artifacts,
    constants::{FAILED, MAX_CHECK_REWORK, QUEUED, RUNNING, SETTLED},
    types::StageEffect,
};
use super::{outcome, query};
use crate::task_board::{
    constants::CHECKS,
    stage::{
        agent::AgentStage,
        transitions::{
            self,
            types::{BoardAction, Position, TransitionEffect},
        },
    },
};
use rusqlite::{params, Connection, TransactionBehavior};
use std::path::Path;

const CHECKS_FAILED: &str = "Checks failed; sent back to rework automatically.";

/// `None` when the automatic budget is spent: the review then runs and reports the failure.
pub(crate) fn redirect(
    conn: &mut Connection,
    base: &Path,
    id: &str,
    summary: &str,
) -> Result<Option<StageEffect>, String> {
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|e| e.to_string())?;
    let ctx = query::context(&tx, id)?;
    if ctx.run.status != RUNNING || !query::current(&tx, &ctx)? {
        return Ok(Some(StageEffect::default()));
    }
    if AgentStage::parse(&ctx.run.stage) != Some(AgentStage::CodeReview) {
        return Err("Checks run only before a code review.".into());
    }
    if outcome::brief_streak(&tx, &ctx.card.id, CHECKS)? >= MAX_CHECK_REWORK
        || outcome::budget_spent(&tx, &ctx.card.id)?
    {
        return Ok(None);
    }

    let next = transitions::transition(
        Position {
            column: &ctx.card.column_id,
            run_state: &ctx.card.run_state,
            archived: ctx.card.archived,
        },
        BoardAction::AutoRework,
    )?;
    let cycle = if next.effects.contains(&TransitionEffect::NextReworkCycle) {
        ctx.card
            .rework_cycle
            .checked_add(1)
            .ok_or("Rework cycle overflow")?
    } else {
        ctx.card.rework_cycle
    };
    let now = query::now()?;
    let position = query::next_position(&tx, &next.column)?;
    let body = format!("## Checks failed\n\n{summary}\n\nMake the project's verify command pass, with a fix for the cause rather than a skipped or weakened check.");

    artifacts::publish(
        &tx,
        base,
        &ctx.card.id,
        &outcome::brief(body),
        CHECKS,
        None,
        now,
    )?;
    tx.execute("UPDATE task_board_stage_runs SET status=?2,dispatch=?3,error=?4,completed_at=?5 WHERE id=?1",params![id,FAILED,SETTLED,CHECKS_FAILED,now]).map_err(|e|e.to_string())?;
    tx.execute("UPDATE task_board_cards SET column_id=?2,run_state=?3,last_error=NULL,updated_at=?4,position=?5,queued_at=?6,rework_cycle=?7 WHERE id=?1",params![ctx.card.id,next.column,next.run_state,now.max(ctx.card.updated_at.saturating_add(1)),position,(next.run_state==QUEUED).then_some(now),cycle]).map_err(|e|e.to_string())?;
    let card = query::card(&tx, &ctx.card.id)?;
    tx.commit().map_err(|e| e.to_string())?;

    Ok(Some(StageEffect {
        changed: true,
        card: Some(card),
        notice: None,
    }))
}
