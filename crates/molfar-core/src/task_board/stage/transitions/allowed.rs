use super::{
    moves::legal_moves,
    transition,
    types::{BoardAction, Move, Position},
};
use crate::task_board::{
    constants::CODE_REVIEW,
    stage::{
        agent::AgentStage,
        contracts::constants::REVIEW,
        lifecycle::constants::{FAILED, SUCCEEDED},
    },
    types::{Card, Snapshot},
};

fn has_completed_review(card: &Card, snapshot: &Snapshot) -> bool {
    let review =
        snapshot.runs.iter().rev().find(|run| {
            run.card_id == card.id && run.stage == CODE_REVIEW && run.status == SUCCEEDED
        });

    review.is_some_and(|run| {
        snapshot.artifacts.iter().any(|artifact| {
            artifact.card_id == card.id
                && artifact.kind == REVIEW
                && artifact.stage_run_id.as_deref() == Some(&run.id)
        })
    })
}

pub fn back_allowed(card: &Card, snapshot: Option<&Snapshot>) -> bool {
    if card.archived || card.run_state != FAILED {
        return false;
    }

    match AgentStage::parse(&card.column_id) {
        Some(AgentStage::CodeReview | AgentStage::Rework) => {
            snapshot.is_some_and(|snapshot| has_completed_review(card, snapshot))
        }
        Some(_) => true,
        None => false,
    }
}

pub fn allowed_moves(card: &Card, snapshot: Option<&Snapshot>) -> Vec<Move> {
    let snapshot = snapshot.filter(|snapshot| snapshot.selected.as_deref() == Some(&card.id));
    let back = snapshot.is_none() || back_allowed(card, snapshot);
    legal_moves(Position {
        column: &card.column_id,
        run_state: &card.run_state,
        archived: card.archived,
    })
    .into_iter()
    .filter(|target| target.action != BoardAction::Back || back)
    .collect()
}

pub fn action_allowed(card: &Card, snapshot: &Snapshot, action: BoardAction) -> Result<(), String> {
    transition(
        Position {
            column: &card.column_id,
            run_state: &card.run_state,
            archived: card.archived,
        },
        action,
    )?;

    let movement = match action {
        BoardAction::Retry | BoardAction::Cancel => return Ok(()),
        BoardAction::Answer => BoardAction::RequestChanges,
        other => other,
    };
    if allowed_moves(card, Some(snapshot))
        .iter()
        .any(|target| target.action == movement)
        && (movement != BoardAction::Back || back_allowed(card, Some(snapshot)))
    {
        return Ok(());
    }

    Err(format!("Cannot {} this Board card.", action.id()))
}
