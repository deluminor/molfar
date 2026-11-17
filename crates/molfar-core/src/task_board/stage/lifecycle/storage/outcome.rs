//! What the engine does with a verified stage output: advance, continue an unfinished
//! run, stop for the user, or send review findings straight back to rework.
use super::super::{
    constants::{
        CANCELLED, COMPACT_AT, FAILED, INTERRUPTED, MAX_AUTOMATIC_TURNS, MAX_AUTO_REWORK,
        MAX_COMPACTIONS, PARTIAL,
    },
    stop,
    types::Signals,
};
use crate::task_board::{
    constants::{CODE_REVIEW, ENGINE, GRILL, IMPLEMENT, REWORK, USER},
    stage::{
        agent::AgentStage,
        contracts::{
            constants::{IMPL_REPORT, REVIEW, REWORK_BRIEF},
            review,
            status::{self, ImplStatus},
            types::{FindingSeverity, ParsedArtifact, ReviewVerdict},
        },
    },
};
use rusqlite::{params, Connection};

#[derive(Debug, PartialEq, Eq)]
pub(super) enum Outcome {
    Advance,
    Continue,
    Stop(String),
    AutoRework(String),
}

const AUTO_REWORK_NOTE: &str =
    "Automatic rework after code review: resolve every finding above completely, with tests.";

pub(super) fn decide(
    conn: &Connection,
    card: &str,
    stage: AgentStage,
    artifacts: &[ParsedArtifact],
    signals: Signals,
) -> Result<Outcome, String> {
    let body = |kind: &str| {
        artifacts
            .iter()
            .find(|artifact| artifact.kind == kind)
            .map(|artifact| artifact.body.as_str())
            .ok_or_else(|| format!("The stage did not return: {kind}."))
    };

    match stage {
        AgentStage::Grill => Ok(Outcome::Advance),
        AgentStage::Implement | AgentStage::Rework => match status::parse(body(IMPL_REPORT)?)? {
            ImplStatus::Complete => Ok(Outcome::Advance),
            ImplStatus::Blocked => Ok(Outcome::Stop(stop::blocked())),
            ImplStatus::Partial => continue_or_stop(conn, card, signals),
        },
        AgentStage::CodeReview => rework_or_advance(conn, card, body(REVIEW)?),
    }
}

/// A self-declared `partial` is never a stop on its own: only the turn budget or a context
/// that filled up again after the last allowed compaction ends the run.
fn continue_or_stop(conn: &Connection, card: &str, signals: Signals) -> Result<Outcome, String> {
    if budget_spent(conn, card)? {
        return Ok(Outcome::Stop(stop::budget()));
    }
    let full = signals
        .context_ratio
        .is_some_and(|ratio| ratio >= COMPACT_AT);
    if full && signals.compactions >= MAX_COMPACTIONS {
        return Ok(Outcome::Stop(stop::compaction_cap()));
    }

    Ok(Outcome::Continue)
}

fn rework_or_advance(conn: &Connection, card: &str, markdown: &str) -> Result<Outcome, String> {
    let parsed = review::parse(markdown)?;
    let serious = |severity: FindingSeverity| {
        matches!(severity, FindingSeverity::Blocking | FindingSeverity::Major)
    };
    let needs_rework = parsed.verdict == ReviewVerdict::ChangesRequested
        && parsed
            .findings
            .iter()
            .any(|finding| serious(finding.severity));
    if !needs_rework
        || brief_streak(conn, card, ENGINE)? >= MAX_AUTO_REWORK
        || budget_spent(conn, card)?
    {
        return Ok(Outcome::Advance);
    }

    let selected: Vec<String> = parsed
        .findings
        .iter()
        .filter(|finding| finding.severity != FindingSeverity::Nit)
        .map(|finding| finding.id.clone())
        .collect();
    review::rework_brief(&parsed.findings, &selected, AUTO_REWORK_NOTE).map(Outcome::AutoRework)
}

/// The unfinished turns of this stage run before `run`, newest first. Any other run (a
/// retry, a failure, another stage) ends the streak, so an explicit Retry starts a new run.
pub(crate) fn turn_streak(conn: &Connection, card: &str, run: &str) -> Result<Vec<String>, String> {
    let mut statement = conn
        .prepare("SELECT id,status FROM task_board_stage_runs WHERE card_id=?1 AND id<>?2 ORDER BY rowid DESC")
        .map_err(|e| e.to_string())?;
    let rows = statement
        .query_map(params![card, run], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?;

    let mut streak = Vec::new();
    for row in rows {
        let (id, status) = row.map_err(|e| e.to_string())?;
        if status != PARTIAL {
            break;
        }
        streak.push(id);
    }
    Ok(streak)
}

/// Engine briefs from `source` since the user last wrote one; each automatic loop
/// (review findings, failing checks) keeps its own budget.
pub(crate) fn brief_streak(conn: &Connection, card: &str, source: &str) -> Result<usize, String> {
    let mut statement = conn
        .prepare("SELECT source FROM task_board_artifacts WHERE card_id=?1 AND kind=?2 ORDER BY version DESC")
        .map_err(|e| e.to_string())?;
    let sources = statement
        .query_map(params![card, REWORK_BRIEF], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?;

    let mut streak = 0;
    for entry in sources {
        let entry = entry.map_err(|e| e.to_string())?;
        if entry == USER {
            break;
        }
        if entry == source {
            streak += 1;
        }
    }
    Ok(streak)
}

/// Agent turns since the user last decided: after Grill, after a stop that needed them
/// (failed, cancelled or interrupted run, so Retry starts a new budget) and after their
/// latest written decision (answers, plan edit, rework request).
pub(crate) fn budget_spent(conn: &Connection, card: &str) -> Result<bool, String> {
    let runs: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM task_board_stage_runs WHERE card_id=?1 AND stage IN (?2,?3,?4) \
             AND rowid > COALESCE((SELECT MAX(rowid) FROM task_board_stage_runs WHERE card_id=?1 AND (stage=?5 OR status IN (?7,?8,?9))),0) \
             AND started_at > COALESCE((SELECT MAX(created_at) FROM task_board_artifacts WHERE card_id=?1 AND source=?6),0)",
            params![card, IMPLEMENT, REWORK, CODE_REVIEW, GRILL, USER, FAILED, CANCELLED, INTERRUPTED],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(runs >= MAX_AUTOMATIC_TURNS)
}

/// How many unfinished turns of this stage run came before `run`; zero for a fresh start.
pub(crate) fn continuation(conn: &Connection, card: &str, run: &str) -> Result<usize, String> {
    turn_streak(conn, card, run).map(|streak| streak.len())
}

pub(crate) fn brief(body: String) -> ParsedArtifact {
    ParsedArtifact {
        kind: REWORK_BRIEF.into(),
        body,
    }
}
