use super::*;
use crate::task_board::{
    constants::{CODE_REVIEW, FINAL_REVIEW},
    stage::contracts::{constants::REVIEW, review},
    stage::owner::types::FinalReview,
};

fn version(conn: &Connection, card: &str) -> Result<i64, String> {
    conn.query_row("SELECT version FROM task_board_artifacts WHERE card_id=?1 AND kind=?2 AND stage_run_id=(SELECT id FROM task_board_stage_runs WHERE card_id=?1 AND stage=?3 AND status=?4 ORDER BY rowid DESC LIMIT 1) ORDER BY version DESC LIMIT 1", params![card,REVIEW,CODE_REVIEW,SUCCEEDED], |row| row.get(0)).optional().map_err(|e| e.to_string())?.ok_or_else(|| "Card has no current successful code review.".into())
}

pub(crate) fn current_review(
    conn: &Connection,
    base: &Path,
    id: &str,
) -> Result<(i64, super::super::contracts::types::CodeReview), String> {
    let version = version(conn, id)?;
    let review = review::parse(&artifacts::read(base, id, REVIEW, version)?)?;
    Ok((version, review))
}

pub(crate) fn load_final(conn: &Connection, base: &Path, id: &str) -> Result<FinalReview, String> {
    let card = query::card(conn, id)?;
    if card.column_id != FINAL_REVIEW {
        return Err("Card is not at final review.".into());
    }
    transitions::transition(
        Position {
            column: &card.column_id,
            run_state: &card.run_state,
            archived: card.archived,
        },
        BoardAction::Rework,
    )?;
    let (version, review) = current_review(conn, base, id)?;
    Ok(FinalReview {
        card,
        version,
        review,
    })
}

pub(super) fn brief(
    conn: &Connection,
    base: &Path,
    card: &Card,
    selected: &[String],
    note: &str,
    expected: i64,
) -> Result<String, String> {
    if selected.len() > constants::MAX_ANSWERS
        || note.len() > MAX_ARTIFACT
        || selected.iter().any(|id| id.len() > 200)
    {
        return Err("Rework selection exceeds the artifact limit.".into());
    }
    let current = load_final(conn, base, &card.id)?;
    if current.version != expected {
        return Err("conflict: the review changed; reload and try again".into());
    }
    review::rework_brief(&current.review.findings, selected, note)
}
