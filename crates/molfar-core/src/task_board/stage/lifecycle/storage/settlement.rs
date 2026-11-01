use super::super::{
    artifacts,
    constants::*,
    types::{FailureStatus, NoticeKind, StageEffect, StageNotice, VerifiedGrillOutput},
};
use super::query;
use crate::task_board::{constants::IDLE, types::Card};
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
    output: &VerifiedGrillOutput,
) -> Result<StageEffect, String> {
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|e| e.to_string())?;
    let ctx = query::context(&tx, id)?;
    if !query::current(&tx, &ctx)? {
        return Ok(StageEffect::default());
    }
    if ctx.run.head_before.as_deref() != Some(output.after.head.as_str())
        || ctx.run.porcelain_before.as_deref() != Some(output.after.porcelain.as_str())
        || ctx.run.fingerprint_before.as_deref() != Some(output.after.fingerprint.as_str())
    {
        return Err(
            "Grill changed its read-only checkout; the retained worktree was preserved.".into(),
        );
    }
    if ![PREPARED, SUBMITTED].contains(&ctx.run.dispatch.as_str()) {
        return Err("Grill has no prepared submitted session.".into());
    }
    let now = query::now()?;
    let position = query::next_position(&tx, PLAN_APPROVAL)?;
    artifacts::write(&tx, base, &ctx.card.id, id, &output.artifacts, now)?;
    tx.execute("UPDATE task_board_stage_runs SET status=?2,dispatch=?3,head_after=?4,completed_at=?5 WHERE id=?1",params![id,SUCCEEDED,SETTLED,output.after.head,now]).map_err(|e|e.to_string())?;
    tx.execute("UPDATE task_board_cards SET column_id=?2,run_state=?3,last_error=NULL,queued_at=NULL,updated_at=?4,position=?5 WHERE id=?1",params![ctx.card.id,PLAN_APPROVAL,IDLE,now.max(ctx.card.updated_at.saturating_add(1)),position]).map_err(|e|e.to_string())?;
    let card = query::card(&tx, &ctx.card.id)?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(StageEffect {
        changed: true,
        notice: Some(notice(
            &card,
            NoticeKind::Gate,
            "Plan ready for approval.".into(),
        )),
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
        || card.column_id != GRILL
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
