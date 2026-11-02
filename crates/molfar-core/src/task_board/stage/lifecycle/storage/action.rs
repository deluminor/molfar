use super::super::{
    constants::*,
    types::{ActionEffect, StageAction},
};
use super::query;
use crate::task_board::stage::{
    agent::AgentStage,
    choice::overrides::merge_retry_override,
    transitions::{
        self,
        types::{BoardAction, Position, TransitionEffect},
    },
};
use rusqlite::{params, Connection, TransactionBehavior};
use std::path::Path;

pub(crate) fn apply(
    conn: &mut Connection,
    base: &Path,
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
    let stage = AgentStage::parse(&card.column_id);
    let (board_action, native) = match &action {
        StageAction::Start => (BoardAction::Start, true),
        StageAction::Retry(_) => (BoardAction::Retry, stage == Some(AgentStage::Grill)),
        StageAction::Cancel => (BoardAction::Cancel, stage == Some(AgentStage::Grill)),
        StageAction::Back => (BoardAction::Back, true),
        StageAction::Answer { .. } => (BoardAction::Answer, true),
        StageAction::RequestChanges(_) => (BoardAction::RequestChanges, true),
        StageAction::EditPlan(_) => (BoardAction::EditPlan, true),
    };
    let position = Position {
        column: &card.column_id,
        run_state: &card.run_state,
        archived: card.archived,
    };
    let next = transitions::transition(position, board_action)?;
    if !native {
        return Err("This action is not available for the current Board state.".into());
    }
    let overrides = match (&action, stage) {
        (StageAction::Retry(Some(change)), Some(stage)) => {
            merge_retry_override(&card.overrides_json, stage, change)?
        }
        _ => card.overrides_json.clone(),
    };
    let column = next.column.as_str();
    let state = next.run_state;
    let round = if next.effects.contains(&TransitionEffect::ResetGrillRound) {
        1
    } else if next.effects.contains(&TransitionEffect::NextGrillRound) {
        card.grill_round
            .checked_add(1)
            .ok_or("Grill round overflow")?
    } else {
        card.grill_round
    };
    let error = (action == StageAction::Cancel).then_some("Cancelled by user.");
    let now = query::now()?.max(card.updated_at.saturating_add(1));
    crate::task_board::stage::owner::save(&tx, base, &card, &action, now)?;
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
    tx.execute("UPDATE task_board_cards SET column_id=?2,run_state=?3,grill_round=?4,last_error=?5,queued_at=?6,updated_at=?7,position=?8,overrides_json=?9 WHERE id=?1",params![id,column,state,round,error,(state==QUEUED).then_some(now),now,position,overrides]).map_err(|e|e.to_string())?;
    let card = query::card(&tx, id)?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(ActionEffect {
        card,
        stop_session_id,
    })
}
