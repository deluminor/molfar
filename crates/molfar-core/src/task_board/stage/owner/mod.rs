mod constants;
mod questions;
pub mod types;

use super::{
    contracts::{
        constants::{ANSWERS, PLAN, QUESTIONS},
        types::ParsedArtifact,
    },
    lifecycle::{
        artifacts,
        constants::{MAX_ARTIFACT, SUCCEEDED},
        storage::query,
        types::StageAction,
    },
    transitions::{
        self,
        types::{BoardAction, Position},
    },
};
use crate::task_board::{
    constants::{GRILL, USER},
    types::Card,
};
use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;
use types::{Question, Review};

pub(crate) fn latest(conn: &Connection, card: &str, kind: &str) -> Result<Option<i64>, String> {
    conn.query_row("SELECT version FROM task_board_artifacts WHERE card_id=?1 AND kind=?2 ORDER BY version DESC LIMIT 1", params![card,kind], |row| row.get(0))
        .optional().map_err(|e| e.to_string())
}

pub(crate) fn question_version(conn: &Connection, card: &str) -> Result<Option<i64>, String> {
    conn.query_row(
        "SELECT version FROM task_board_artifacts WHERE card_id=?1 AND kind=?2 AND stage_run_id=(SELECT id FROM task_board_stage_runs WHERE card_id=?1 AND stage=?3 AND status=?4 ORDER BY rowid DESC LIMIT 1) ORDER BY version DESC LIMIT 1",
        params![card, QUESTIONS, GRILL, SUCCEEDED], |row| row.get(0),
    ).optional().map_err(|e| e.to_string())
}

pub(crate) fn current_questions(
    conn: &Connection,
    base: &Path,
    card: &str,
) -> Result<Vec<Question>, String> {
    question_version(conn, card)?
        .map(|version| {
            artifacts::read(base, card, QUESTIONS, version).and_then(|body| questions::parse(&body))
        })
        .unwrap_or_else(|| Ok(Vec::new()))
}

pub(crate) fn load(conn: &Connection, base: &Path, id: &str) -> Result<Review, String> {
    let card = query::card(conn, id)?;
    transitions::transition(
        Position {
            column: &card.column_id,
            run_state: &card.run_state,
            archived: card.archived,
        },
        BoardAction::EditPlan,
    )?;
    let version = latest(conn, id, PLAN)?.ok_or("Board card has no plan artifact.")?;

    Ok(Review {
        questions: current_questions(conn, base, id)?,
        plan: artifacts::read(base, id, PLAN, version)?,
        card,
    })
}

pub(crate) fn save(
    conn: &Connection,
    base: &Path,
    card: &Card,
    action: &StageAction,
    now: i64,
) -> Result<(), String> {
    let (kind, body) = match action {
        StageAction::Answer { answers, note } => {
            if answers.len() > constants::MAX_ANSWERS
                || note.len() > MAX_ARTIFACT
                || answers
                    .iter()
                    .fold(note.len(), |size, a| size.saturating_add(a.answer.len()))
                    > MAX_ARTIFACT
            {
                return Err("Board answers exceed the artifact limit.".into());
            }
            let questions = if answers.is_empty() {
                Vec::new()
            } else {
                current_questions(conn, base, &card.id)?
            };
            (ANSWERS, questions::format(&questions, answers, note))
        }
        StageAction::RequestChanges(note) => {
            if note.len() > MAX_ARTIFACT {
                return Err("Board artifact exceeds the size limit.".into());
            }
            (ANSWERS, questions::format(&[], &[], note))
        }
        StageAction::EditPlan(body) => {
            if body.len() > MAX_ARTIFACT {
                return Err("Board artifact exceeds the size limit.".into());
            }
            (PLAN, body.clone())
        }
        _ => return Ok(()),
    };
    if body.trim().is_empty() {
        return Err("Enter an answer, a change request or a non-empty plan.".into());
    }
    if body.len() > MAX_ARTIFACT {
        return Err("Board artifact exceeds the size limit.".into());
    }

    artifacts::publish(
        conn,
        base,
        &card.id,
        &ParsedArtifact {
            kind: kind.into(),
            body,
        },
        USER,
        None,
        now,
    )
}
