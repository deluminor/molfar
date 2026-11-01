use super::super::{
    constants::*,
    types::{ActionEffect, StageAction},
};
use super::query;
use crate::task_board::constants::{BACKLOG, IDLE};
use rusqlite::{params, Connection, TransactionBehavior};

pub(crate) fn apply(
    conn: &mut Connection,
    id: &str,
    expected: i64,
    action: StageAction,
) -> Result<ActionEffect, String> {
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|e| e.to_string())?;
    let card = query::card(&tx, id)?;
    if card.updated_at != expected {
        return Err("conflict: the card changed; reload and try again".into());
    }
    if card.archived {
        return Err("The card is archived.".into());
    }
    let (column, state, round, error) = match action {
        StageAction::Start if card.column_id == BACKLOG && card.run_state == IDLE => {
            (GRILL, QUEUED, 1, None)
        }
        StageAction::Retry if card.column_id == GRILL && card.run_state == FAILED => {
            (GRILL, QUEUED, card.grill_round, None)
        }
        StageAction::Cancel
            if card.column_id == GRILL && [QUEUED, RUNNING].contains(&card.run_state.as_str()) =>
        {
            (GRILL, FAILED, card.grill_round, Some("Cancelled by user."))
        }
        _ => return Err("This action is not available for the current Board state.".into()),
    };
    let now = query::now()?.max(card.updated_at.saturating_add(1));
    let position = if card.column_id != column {
        query::next_position(&tx, column)?
    } else {
        card.position
    };
    let mut stop_session_id = None;
    if action == StageAction::Cancel {
        if let Some(run_id) = query::latest_id(&tx, id)? {
            let run = query::run(&tx, &run_id)?;
            if run.status == RUNNING {
                stop_session_id = run.session_id;
                tx.execute("UPDATE task_board_stage_runs SET status=?6,dispatch=?2,error=?3,completed_at=?4 WHERE id=?1 AND status=?5",params![run_id,SETTLED,error,now,RUNNING,CANCELLED]).map_err(|e|e.to_string())?;
            }
        }
    }
    tx.execute("UPDATE task_board_cards SET column_id=?2,run_state=?3,grill_round=?4,last_error=?5,queued_at=?6,updated_at=?7,position=?8 WHERE id=?1",params![id,column,state,round,error,(state==QUEUED).then_some(now),now,position]).map_err(|e|e.to_string())?;
    let card = query::card(&tx, id)?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(ActionEffect {
        card,
        stop_session_id,
    })
}
