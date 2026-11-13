//! Cards whose pull request is open and whose CI decides between Done and Rework.
use super::{
    record,
    storage::{begin, delivering, next, stamp},
    types::{Delivery, DeliveryMethod},
};
use crate::task_board::{
    constants::{CHECKS, FINAL_REVIEW, IDLE, WAITING_CI},
    stage::{
        contracts::{
            constants::REVIEW,
            review,
            types::{FindingSeverity, ParsedArtifact},
        },
        lifecycle::{
            artifacts,
            constants::{MAX_CHECK_REWORK, QUEUED},
            storage::{outcome, query, settlement::bounded},
        },
        owner,
        transitions::types::{BoardAction, TransitionEffect},
    },
    types::Card,
};
use rusqlite::{params, Connection};
use std::path::Path;

fn waiting_card(conn: &Connection, id: &str, expected: i64) -> Result<Card, String> {
    let card = query::card(conn, id)?;
    if card.archived
        || card.column_id != FINAL_REVIEW
        || card.run_state != WAITING_CI
        || card.updated_at != expected
    {
        return Err("conflict: the card is no longer waiting for CI".into());
    }
    Ok(card)
}

pub(crate) fn await_ci(
    conn: &mut Connection,
    id: &str,
    delivery: &Delivery,
) -> Result<Card, String> {
    let tx = begin(conn)?;
    let card = delivering(&tx, id)?;
    let next = next(&card, BoardAction::AwaitCi)?;

    tx.execute(
        "UPDATE task_board_cards SET run_state=?2,delivery_json=?3,last_error=NULL,updated_at=?4 WHERE id=?1",
        params![id, next.run_state, record::to_json(delivery)?, stamp(&card)?],
    )
    .map_err(|e| e.to_string())?;
    let card = query::card(&tx, id)?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(card)
}

pub(crate) fn waiting(conn: &Connection) -> Result<Vec<Card>, String> {
    let mut statement = conn
        .prepare("SELECT id FROM task_board_cards WHERE column_id=?1 AND run_state=?2 AND archived=0 ORDER BY rowid")
        .map_err(|e| e.to_string())?;
    let ids = statement
        .query_map([FINAL_REVIEW, WAITING_CI], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    ids.iter().map(|id| query::card(conn, id)).collect()
}

/// Green CI: the card returns to delivering so the remaining steps (merge, cleanup) run.
pub(crate) fn ci_passed(conn: &mut Connection, id: &str, expected: i64) -> Result<Card, String> {
    let tx = begin(conn)?;
    let card = waiting_card(&tx, id, expected)?;
    let next = next(&card, BoardAction::CiPassed)?;

    tx.execute(
        "UPDATE task_board_cards SET run_state=?2,updated_at=?3 WHERE id=?1",
        params![id, next.run_state, stamp(&card)?],
    )
    .map_err(|e| e.to_string())?;
    let card = query::card(&tx, id)?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(card)
}

/// Red CI: automatic rework while the checks budget lasts, then a failed card for the user.
pub(crate) fn ci_failed(
    conn: &mut Connection,
    base: &Path,
    id: &str,
    expected: i64,
    brief: &str,
) -> Result<Card, String> {
    let tx = begin(conn)?;
    let card = waiting_card(&tx, id, expected)?;
    let now = stamp(&card)?;

    let fixes_spent = outcome::brief_streak(&tx, id, CHECKS)? >= MAX_CHECK_REWORK;
    if fixes_spent || outcome::budget_spent(&tx, id)? {
        let failed = next(&card, BoardAction::DeliveryFailed)?;
        let url = record::parse(card.delivery_json.as_deref())
            .and_then(|d| d.pr_url)
            .unwrap_or_default();
        let reason = if fixes_spent {
            format!("CI still fails after {MAX_CHECK_REWORK} automatic fixes")
        } else {
            "CI fails and the automatic budget is used up".to_owned()
        };
        let error = format!(
            "{reason}. Open {url} to see why, then request a rework, Deliver again or Reject."
        );
        tx.execute(
            "UPDATE task_board_cards SET run_state=?2,last_error=?3,updated_at=?4 WHERE id=?1",
            params![id, failed.run_state, bounded(&error), now],
        )
        .map_err(|e| e.to_string())?;
    } else {
        let rework = next(&card, BoardAction::CiFailed)?;
        let cycle = if rework.effects.contains(&TransitionEffect::NextReworkCycle) {
            card.rework_cycle
                .checked_add(1)
                .ok_or("Rework cycle overflow")?
        } else {
            card.rework_cycle
        };
        let artifact = ParsedArtifact {
            kind: crate::task_board::stage::contracts::constants::REWORK_BRIEF.into(),
            body: brief.into(),
        };
        artifacts::publish(&tx, base, id, &artifact, CHECKS, None, now)?;
        let position = query::next_position(&tx, &rework.column)?;
        tx.execute(
            "UPDATE task_board_cards SET column_id=?2,run_state=?3,last_error=NULL,updated_at=?4,position=?5,queued_at=?6,rework_cycle=?7 WHERE id=?1",
            params![id, rework.column, rework.run_state, now, position, (rework.run_state == QUEUED).then_some(now), cycle],
        )
        .map_err(|e| e.to_string())?;
    }

    let card = query::card(&tx, id)?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(card)
}

fn clean_review(conn: &Connection, base: &Path, id: &str) -> Result<bool, String> {
    let Some(version) = owner::latest(conn, id, REVIEW)? else {
        return Ok(false);
    };
    let parsed = review::parse(&artifacts::read(base, id, REVIEW, version)?)?;
    Ok(!parsed.findings.iter().any(|finding| {
        matches!(
            finding.severity,
            FindingSeverity::Blocking | FindingSeverity::Major
        )
    }))
}

/// Cards back at Final review after a CI fix: the user already chose to deliver, so the
/// engine pushes again when the new review has nothing blocking or major.
pub(crate) fn redeliveries(
    conn: &Connection,
    base: &Path,
) -> Result<Vec<(String, i64, DeliveryMethod)>, String> {
    let mut statement = conn
        .prepare("SELECT id FROM task_board_cards WHERE column_id=?1 AND run_state=?2 AND archived=0 AND delivery_json IS NOT NULL ORDER BY rowid")
        .map_err(|e| e.to_string())?;
    let ids = statement
        .query_map([FINAL_REVIEW, IDLE], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut due = Vec::new();
    for id in ids {
        let card = query::card(conn, &id)?;
        let Some(pending) = record::parse(card.delivery_json.as_deref()) else {
            continue;
        };
        let open = pending.method != DeliveryMethod::Keep
            && pending.delivered_at == 0
            && pending.pr_url.is_some();
        if open && clean_review(conn, base, &id)? {
            due.push((id, card.updated_at, pending.method));
        }
    }
    Ok(due)
}
