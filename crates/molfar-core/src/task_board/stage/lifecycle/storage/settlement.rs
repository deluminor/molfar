use super::super::{
    artifacts,
    constants::*,
    types::{FailureStatus, NoticeKind, StageEffect, StageNotice, VerifiedStageOutput},
};
use super::outcome::{self, Outcome};
use super::query;
use crate::task_board::{
    constants::{ENGINE, FINAL_REVIEW, IDLE, PLAN_APPROVAL},
    stage::{
        agent::AgentStage,
        checkout::policy,
        transitions::{
            self,
            types::{BoardAction, Position, TransitionEffect},
        },
    },
    types::Card,
};
use rusqlite::{params, Connection, TransactionBehavior};
use std::path::Path;

pub(crate) fn notice(card: &Card, kind: NoticeKind, body: String) -> StageNotice {
    StageNotice {
        card_id: card.id.clone(),
        project_cwd: card.project_cwd.clone(),
        kind,
        title: format!("#{} {}", card.number, card.title),
        body,
    }
}

pub(crate) fn bounded(error: &str) -> String {
    if error.len() <= MAX_ERROR {
        return error.into();
    }
    let half = MAX_ERROR / 2;
    let mut head = half;
    while !error.is_char_boundary(head) {
        head -= 1;
    }
    let mut tail = error.len() - half;
    while !error.is_char_boundary(tail) {
        tail += 1;
    }
    format!("{}\n…\n{}", &error[..head], &error[tail..])
}

pub(crate) fn finish(
    conn: &mut Connection,
    base: &Path,
    id: &str,
    output: &VerifiedStageOutput,
) -> Result<StageEffect, String> {
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|e| e.to_string())?;
    let ctx = query::context(&tx, id)?;
    if !query::current(&tx, &ctx)? {
        return Ok(StageEffect::default());
    }
    policy::verify_run(&ctx.run, &output.after)?;
    if ![PREPARED, SUBMITTED].contains(&ctx.run.dispatch.as_str()) {
        return Err("Board stage has no prepared submitted session.".into());
    }
    let now = query::now()?;
    artifacts::write(&tx, base, &ctx.card.id, id, &output.artifacts, now)?;
    let stage = AgentStage::parse(&ctx.run.stage).ok_or("Unsupported Board stage.")?;
    let outcome = outcome::decide(&tx, &ctx.card.id, id, stage, &output.artifacts)?;
    let (action, status, error) = match &outcome {
        Outcome::Advance => (BoardAction::StageSucceeded, SUCCEEDED, None),
        Outcome::Continue => (BoardAction::StageContinued, PARTIAL, None),
        Outcome::Stop(error) => (BoardAction::StageFailed, FAILED, Some(error.as_str())),
        Outcome::AutoRework(_) => (BoardAction::AutoRework, SUCCEEDED, None),
    };
    let next = transitions::transition(
        Position {
            column: &ctx.card.column_id,
            run_state: &ctx.card.run_state,
            archived: ctx.card.archived,
        },
        action,
    )?;
    let position = if next.column == ctx.card.column_id {
        ctx.card.position
    } else {
        query::next_position(&tx, &next.column)?
    };
    let cycle = if next.effects.contains(&TransitionEffect::NextReworkCycle) {
        ctx.card
            .rework_cycle
            .checked_add(1)
            .ok_or("Rework cycle overflow")?
    } else {
        ctx.card.rework_cycle
    };

    if let Outcome::AutoRework(body) = &outcome {
        artifacts::publish(
            &tx,
            base,
            &ctx.card.id,
            &outcome::brief(body.clone()),
            ENGINE,
            None,
            now,
        )?;
    }
    tx.execute("UPDATE task_board_stage_runs SET status=?2,dispatch=?3,head_after=?4,completed_at=?5,error=?6 WHERE id=?1",params![id,status,SETTLED,output.after.head,now,error]).map_err(|e|e.to_string())?;
    tx.execute("UPDATE task_board_cards SET column_id=?2,run_state=?3,last_error=?4,updated_at=?5,position=?6,queued_at=?7,rework_cycle=?8 WHERE id=?1",params![ctx.card.id,next.column,next.run_state,error,now.max(ctx.card.updated_at.saturating_add(1)),position,(next.run_state==QUEUED).then_some(now),cycle]).map_err(|e|e.to_string())?;
    let card = query::card(&tx, &ctx.card.id)?;
    tx.commit().map_err(|e| e.to_string())?;

    let notice = if let Some(error) = error {
        Some(notice(&card, NoticeKind::Failed, error.into()))
    } else if card.run_state == IDLE
        && [PLAN_APPROVAL, FINAL_REVIEW].contains(&card.column_id.as_str())
    {
        let body = if card.column_id == PLAN_APPROVAL {
            "Plan ready for approval."
        } else {
            "Ready for final review."
        };
        Some(notice(&card, NoticeKind::Gate, body.into()))
    } else {
        None
    };
    Ok(StageEffect {
        changed: true,
        notice,
        card: Some(card),
    })
}

pub(crate) fn fail(
    conn: &mut Connection,
    id: &str,
    status: FailureStatus,
    error: &str,
) -> Result<StageEffect, String> {
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|e| e.to_string())?;
    let ctx = query::context(&tx, id)?;
    if ctx.run.status != RUNNING {
        return Ok(StageEffect::default());
    }
    let current = query::current(&tx, &ctx)?;
    let error = bounded(error);
    let now = query::now()?;
    tx.execute("UPDATE task_board_stage_runs SET status=?2,dispatch=?3,error=?4,completed_at=?5 WHERE id=?1",params![id,status.id(),SETTLED,error,now]).map_err(|e|e.to_string())?;
    let card = if current {
        tx.execute("UPDATE task_board_cards SET run_state=?2,last_error=?3,queued_at=NULL,updated_at=?4 WHERE id=?1",params![ctx.card.id,FAILED,error,now.max(ctx.card.updated_at.saturating_add(1))]).map_err(|e|e.to_string())?;
        Some(query::card(&tx, &ctx.card.id)?)
    } else {
        None
    };
    tx.commit().map_err(|e| e.to_string())?;
    let notice = card
        .as_ref()
        .map(|card| notice(card, NoticeKind::Failed, error));
    Ok(StageEffect {
        changed: true,
        card,
        notice,
    })
}

pub(crate) fn fail_claim(
    conn: &mut Connection,
    id: &str,
    expected: i64,
    error: &str,
) -> Result<StageEffect, String> {
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|e| e.to_string())?;
    let card = query::card(&tx, id)?;
    if card.updated_at != expected
        || card.archived
        || AgentStage::parse(&card.column_id).is_none()
        || card.run_state != RUNNING
    {
        return Ok(StageEffect::default());
    }
    if let Some(run) = query::latest_id(&tx, id)? {
        if query::run(&tx, &run)?.status == RUNNING {
            return Err("The claimed card already owns an active run.".into());
        }
    }
    let error = bounded(error);
    let now = query::now()?.max(card.updated_at.saturating_add(1));
    tx.execute("UPDATE task_board_cards SET run_state=?2,last_error=?3,queued_at=NULL,updated_at=?4 WHERE id=?1",params![id,FAILED,error,now]).map_err(|e|e.to_string())?;
    let card = query::card(&tx, id)?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(StageEffect {
        changed: true,
        notice: Some(notice(&card, NoticeKind::Failed, error)),
        card: Some(card),
    })
}
