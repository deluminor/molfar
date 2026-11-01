use super::super::{constants::*, types::GrillContext};
use super::query;
use crate::task_board::stage::checkout::types::{CheckoutSnapshot, RetainedCheckout};
use rusqlite::{params, Connection, TransactionBehavior};

pub(crate) fn worktree(
    conn: &mut Connection,
    id: &str,
    tree: &RetainedCheckout,
) -> Result<Option<GrillContext>, String> {
    if tree.path.is_empty()
        || tree.branch.is_empty()
        || tree.base_sha.is_empty()
        || tree.base_ref.is_empty()
    {
        return Err("Incomplete retained Board checkout.".into());
    }
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|e| e.to_string())?;
    let ctx = query::context(&tx, id)?;
    if !query::current(&tx, &ctx)? {
        return Ok(None);
    }
    if ctx
        .card
        .worktree_path
        .as_ref()
        .is_some_and(|path| path != &tree.path)
        || ctx
            .card
            .branch
            .as_ref()
            .is_some_and(|branch| branch != &tree.branch)
        || ctx
            .card
            .base_sha
            .as_ref()
            .is_some_and(|sha| sha != &tree.base_sha)
    {
        return Err("The retained Board checkout changed.".into());
    }
    tx.execute("UPDATE task_board_cards SET worktree_path=?2,branch=?3,base_ref=?4,base_sha=?5,updated_at=?6 WHERE id=?1",params![ctx.card.id,tree.path,tree.branch,tree.base_ref,tree.base_sha,query::now()?.max(ctx.card.updated_at.saturating_add(1))]).map_err(|e|e.to_string())?;
    let result = query::context(&tx, id)?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(Some(result))
}

pub(crate) fn prepared(
    conn: &mut Connection,
    id: &str,
    snapshot: &CheckoutSnapshot,
    session: &str,
) -> Result<Option<GrillContext>, String> {
    if snapshot.head.is_empty() || snapshot.fingerprint.is_empty() {
        return Err("Board checkout snapshot is incomplete.".into());
    }
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|e| e.to_string())?;
    let ctx = query::context(&tx, id)?;
    if !query::current(&tx, &ctx)? {
        return Ok(None);
    }
    if ctx.run.dispatch == SUBMITTED {
        return Ok(Some(ctx));
    }
    let owner: Option<String> = tx
        .query_row(
            "SELECT task_card_id FROM sessions WHERE id=?1",
            [session],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if owner.as_deref() != Some(ctx.card.id.as_str())
        || ctx.run.session_id.as_deref() != Some(session)
    {
        return Err("Board session association changed.".into());
    }
    if ctx.run.dispatch == PREPARED
        && (ctx.run.head_before.as_deref() != Some(&snapshot.head)
            || ctx.run.porcelain_before.as_deref() != Some(&snapshot.porcelain)
            || ctx.run.fingerprint_before.as_deref() != Some(&snapshot.fingerprint))
    {
        return Err("Prepared Board snapshot is immutable.".into());
    }
    tx.execute("UPDATE task_board_stage_runs SET head_before=?2,porcelain_before=?3,fingerprint_before=?4,session_id=?5,dispatch=?6 WHERE id=?1",params![id,snapshot.head,snapshot.porcelain,snapshot.fingerprint,session,PREPARED]).map_err(|e|e.to_string())?;
    let result = query::context(&tx, id)?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(Some(result))
}

pub(crate) fn submitted(conn: &mut Connection, id: &str) -> Result<bool, String> {
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|e| e.to_string())?;
    let ctx = query::context(&tx, id)?;
    if !query::current(&tx, &ctx)? {
        return Ok(false);
    }
    if ![PREPARED, SUBMITTED].contains(&ctx.run.dispatch.as_str()) {
        return Err("Board session was not prepared before submission.".into());
    }
    let changed = tx
        .execute(
            "UPDATE task_board_stage_runs SET dispatch=?2 WHERE id=?1 AND dispatch=?3",
            params![id, SUBMITTED, PREPARED],
        )
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(changed > 0)
}
