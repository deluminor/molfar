//! What the engine does with a verified stage output: advance, continue an unfinished
//! run, stop for the user, or send review findings straight back to rework.
use super::super::constants::{MAX_AUTO_REWORK, MAX_CONTINUATIONS, PARTIAL};
use crate::task_board::{
    constants::{ENGINE, USER},
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
    run: &str,
    stage: AgentStage,
    artifacts: &[ParsedArtifact],
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
        AgentStage::Implement | AgentStage::Rework => {
            match status::parse(body(IMPL_REPORT)?)? {
                ImplStatus::Complete => Ok(Outcome::Advance),
                ImplStatus::Blocked => Ok(Outcome::Stop(
                    "The agent reported it is blocked. Read the implementation report, resolve the blocker, then Retry."
                        .into(),
                )),
                ImplStatus::Partial => continue_or_stop(conn, card, run),
            }
        }
        AgentStage::CodeReview => rework_or_advance(conn, card, body(REVIEW)?),
    }
}

fn continue_or_stop(conn: &Connection, card: &str, run: &str) -> Result<Outcome, String> {
    let streak = partial_streak(conn, card, run)?;
    if streak < MAX_CONTINUATIONS {
        return Ok(Outcome::Continue);
    }

    Ok(Outcome::Stop(format!(
        "Stopped partway {} runs in a row. Read the implementation report, then Retry to continue or go Back and split the plan.",
        streak + 1
    )))
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
    if !needs_rework || brief_streak(conn, card, ENGINE)? >= MAX_AUTO_REWORK {
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

/// Consecutive continuation runs before this one. Any other run (a retry, a failure,
/// another stage) ends the streak, so an explicit Retry always gets a fresh budget.
fn partial_streak(conn: &Connection, card: &str, run: &str) -> Result<usize, String> {
    let mut statement = conn
        .prepare("SELECT status FROM task_board_stage_runs WHERE card_id=?1 AND id<>?2 ORDER BY rowid DESC")
        .map_err(|e| e.to_string())?;
    let statuses = statement
        .query_map(params![card, run], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?;

    let mut streak = 0;
    for status in statuses {
        if status.map_err(|e| e.to_string())? != PARTIAL {
            break;
        }
        streak += 1;
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

/// How many unfinished runs of this streak came before `run`; zero for a fresh start.
pub(crate) fn continuation(conn: &Connection, card: &str, run: &str) -> Result<usize, String> {
    partial_streak(conn, card, run)
}

pub(crate) fn brief(body: String) -> ParsedArtifact {
    ParsedArtifact {
        kind: REWORK_BRIEF.into(),
        body,
    }
}
