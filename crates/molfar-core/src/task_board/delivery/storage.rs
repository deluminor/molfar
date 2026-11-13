use super::{record, types::Delivery};
use crate::task_board::constants::ENGINE;
use crate::task_board::{
    constants::FINAL_REVIEW,
    stage::{
        contracts::{constants::DELIVERY, types::ParsedArtifact},
        lifecycle::{
            artifacts,
            constants::RUNNING,
            storage::{query, settlement::bounded},
        },
        transitions::{
            self,
            types::{BoardAction, Position, Transition},
        },
    },
    types::Card,
};
use rusqlite::{params, Connection, Transaction, TransactionBehavior};
use std::path::Path;

pub(super) fn begin(conn: &mut Connection) -> Result<Transaction<'_>, String> {
    conn.transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|e| e.to_string())
}

pub(super) fn next(card: &Card, action: BoardAction) -> Result<Transition, String> {
    transitions::transition(
        Position {
            column: &card.column_id,
            run_state: &card.run_state,
            archived: card.archived,
        },
        action,
    )
}

pub(super) fn stamp(card: &Card) -> Result<i64, String> {
    Ok(query::now()?.max(card.updated_at.saturating_add(1)))
}

/// Progress after the lock keys on the delivering state, not the start revision it bumped.
pub(super) fn delivering(tx: &Transaction<'_>, id: &str) -> Result<Card, String> {
    let card = query::card(tx, id)?;
    if card.archived || card.column_id != FINAL_REVIEW || card.run_state != RUNNING {
        return Err("conflict: the card is no longer delivering; reload and try again".into());
    }
    Ok(card)
}

pub(crate) fn start(conn: &mut Connection, id: &str, expected: i64) -> Result<Card, String> {
    let tx = begin(conn)?;
    let card = query::card(&tx, id)?;
    if card.updated_at != expected {
        return Err("conflict: the card changed; reload and try again".into());
    }
    let next = next(&card, BoardAction::DeliverStart)?;

    tx.execute(
        "UPDATE task_board_cards SET run_state=?2,last_error=NULL,updated_at=?3 WHERE id=?1",
        params![id, next.run_state, stamp(&card)?],
    )
    .map_err(|e| e.to_string())?;
    let card = query::card(&tx, id)?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(card)
}

pub(crate) fn save_progress(
    conn: &mut Connection,
    id: &str,
    delivery: &Delivery,
) -> Result<Card, String> {
    let tx = begin(conn)?;
    let card = delivering(&tx, id)?;

    tx.execute(
        "UPDATE task_board_cards SET delivery_json=?2,updated_at=?3 WHERE id=?1",
        params![id, record::to_json(delivery)?, stamp(&card)?],
    )
    .map_err(|e| e.to_string())?;
    let card = query::card(&tx, id)?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(card)
}

pub(crate) fn finish(
    conn: &mut Connection,
    base: &Path,
    id: &str,
    delivery: &Delivery,
    worktree_removed: bool,
    warning: Option<&str>,
) -> Result<Card, String> {
    let tx = begin(conn)?;
    let card = delivering(&tx, id)?;
    let next = next(&card, BoardAction::Deliver)?;
    let now = stamp(&card)?;
    let artifact = ParsedArtifact {
        kind: DELIVERY.into(),
        body: record::to_artifact(delivery)?,
    };
    artifacts::publish(&tx, base, id, &artifact, ENGINE, None, now)?;

    let position = query::next_position(&tx, &next.column)?;
    let worktree = if worktree_removed {
        None
    } else {
        card.worktree_path.clone()
    };
    tx.execute(
        "UPDATE task_board_cards SET column_id=?2,run_state=?3,delivery_json=?4,worktree_path=?5,last_error=?6,position=?7,updated_at=?8 WHERE id=?1",
        params![id, next.column, next.run_state, record::to_json(delivery)?, worktree, warning.map(bounded), position, now],
    )
    .map_err(|e| e.to_string())?;
    let card = query::card(&tx, id)?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(card)
}

pub(crate) fn fail(conn: &mut Connection, id: &str, error: &str) -> Result<Card, String> {
    let tx = begin(conn)?;
    let card = delivering(&tx, id)?;
    let next = next(&card, BoardAction::DeliveryFailed)?;

    tx.execute(
        "UPDATE task_board_cards SET run_state=?2,last_error=?3,updated_at=?4 WHERE id=?1",
        params![id, next.run_state, bounded(error), stamp(&card)?],
    )
    .map_err(|e| e.to_string())?;
    let card = query::card(&tx, id)?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(card)
}

/// Archives first so the engine can no longer claim the card; cleanup follows outside.
pub(crate) fn reject(
    conn: &mut Connection,
    id: &str,
    expected: i64,
) -> Result<(Card, Card), String> {
    let tx = begin(conn)?;
    let before = query::card(&tx, id)?;
    if before.updated_at != expected {
        return Err("conflict: the card changed; reload and try again".into());
    }
    let next = next(&before, BoardAction::Reject)?;

    tx.execute(
        "UPDATE task_board_cards SET run_state=?2,archived=1,worktree_path=NULL,updated_at=?3 WHERE id=?1",
        params![id, next.run_state, stamp(&before)?],
    )
    .map_err(|e| e.to_string())?;
    let archived = query::card(&tx, id)?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok((before, archived))
}

pub(crate) fn note_archived(
    conn: &mut Connection,
    id: &str,
    worktree: Option<&str>,
    error: &str,
) -> Result<Card, String> {
    let tx = begin(conn)?;
    let card = query::card(&tx, id)?;
    if !card.archived {
        return Err("conflict: the card is no longer archived".into());
    }

    tx.execute(
        "UPDATE task_board_cards SET worktree_path=COALESCE(?2,worktree_path),last_error=?3,updated_at=?4 WHERE id=?1",
        params![id, worktree, bounded(error), stamp(&card)?],
    )
    .map_err(|e| e.to_string())?;
    let card = query::card(&tx, id)?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(card)
}

pub(crate) fn stuck(conn: &Connection) -> Result<Vec<String>, String> {
    let mut statement = conn
        .prepare("SELECT id FROM task_board_cards WHERE column_id=?1 AND run_state=?2 AND archived=0 ORDER BY rowid")
        .map_err(|e| e.to_string())?;
    let ids = statement
        .query_map([FINAL_REVIEW, RUNNING], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string());
    ids
}
