use super::super::{constants::*, types::StageContext};
use super::query;
use crate::task_board::stage::contracts::constants::TEMPLATE_VERSION;
use crate::task_board::{
    constants::{CODE_REVIEW, GRILL, IMPLEMENT, REWORK},
    stage::agent::AgentStage,
};
use crate::task_board::{read, stage::choice::types::ResolvedStageChoice, types::Card};
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};

pub(crate) fn next(conn: &mut Connection) -> Result<Option<Card>, String> {
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|e| e.to_string())?;
    let settings = query::settings(&tx)?;
    let limit = settings
        .get("maxConcurrentStages")
        .map(|value| value.as_i64().ok_or("Invalid Board concurrency setting."))
        .transpose()?
        .unwrap_or(DEFAULT_CONCURRENCY);
    if !(MIN_CONCURRENCY..=MAX_CONCURRENCY).contains(&limit) {
        return Err("Concurrent stages must be between 1 and 10.".into());
    }
    let running: i64 = tx
        .query_row(
            "SELECT COUNT(*) FROM task_board_cards WHERE run_state=?1 AND archived=0",
            [RUNNING],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if running >= limit {
        return Ok(None);
    }
    let next:Option<String>=tx.query_row("SELECT id FROM task_board_cards WHERE run_state=?1 AND column_id IN (?2,?3,?4,?5) AND (column_id!=?2 OR grill_round>=1) AND archived=0 ORDER BY queued_at,number LIMIT 1",params![QUEUED,GRILL,IMPLEMENT,CODE_REVIEW,REWORK],|r|r.get(0)).optional().map_err(|e|e.to_string())?;
    let Some(id) = next else { return Ok(None) };
    let old = query::card(&tx, &id)?;
    let now = query::now()?.max(old.updated_at.saturating_add(1));
    tx.execute(
        "UPDATE task_board_cards SET run_state=?2,queued_at=NULL,updated_at=?3 WHERE id=?1",
        params![id, RUNNING, now],
    )
    .map_err(|e| e.to_string())?;
    let card = read::card(&tx, &id).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(card)
}

pub(crate) fn accept(
    conn: &mut Connection,
    card_id: &str,
    expected: i64,
    id: &str,
    choice: &ResolvedStageChoice,
) -> Result<StageContext, String> {
    crate::task_board::create::validation::id(id)?;
    let settings = serde_json::to_string(&choice.model_settings).map_err(|e| e.to_string())?;
    if !choice.model_settings.is_object()
        || settings.len() > 20_000
        || choice.model.trim().is_empty()
        || choice.model.len() > 200
    {
        return Err("Invalid resolved Board model settings.".into());
    }
    if !crate::task_board::stage::choice::config::is_runtime_mode(&choice.runtime_mode) {
        return Err("Invalid Board runtime mode.".into());
    }
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|e| e.to_string())?;
    let card = query::card(&tx, card_id)?;
    if card.updated_at != expected
        || card.archived
        || AgentStage::parse(&card.column_id).is_none()
        || card.run_state != RUNNING
        || (card.column_id == GRILL && card.grill_round < 1)
    {
        return Err("The claimed Board card changed before acceptance.".into());
    }
    if let Some(latest) = query::latest_id(&tx, card_id)? {
        if query::run(&tx, &latest)?.status == RUNNING {
            return Err("This card already has an active stage run.".into());
        }
    }
    let model = crate::store::desktop_model_id(Some(&choice.model), choice.kind.id());
    let attempt:i64=tx.query_row("SELECT COALESCE(MAX(attempt),0)+1 FROM task_board_stage_runs WHERE card_id=?1 AND stage=?2",params![card_id,card.column_id],|r|r.get(0)).map_err(|e|e.to_string())?;
    tx.execute("INSERT INTO task_board_stage_runs(id,card_id,stage,attempt,harness,model,settings_json,runtime_mode,template_version,dispatch,status,started_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)",params![id,card_id,card.column_id,attempt,choice.kind.id(),model,settings,choice.runtime_mode,TEMPLATE_VERSION,ACCEPTED,RUNNING,query::now()?]).map_err(|e|e.to_string())?;
    let context = query::context(&tx, id)?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(context)
}
