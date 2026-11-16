use molfar_core::task_board::constants::{CODE_REVIEW, COLUMNS};
use molfar_core::task_board::stage::contracts::constants::REVIEW;
use molfar_core::task_board::stage::lifecycle::constants::{FAILED, SUCCEEDED};
use molfar_core::task_board::stage::{agent::AgentStage, transitions::back_target};
use molfar_core::task_board::types::{Card, Snapshot};

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

pub(in crate::task_board) fn back_label(
    card: &Card,
    snapshot: Option<&Snapshot>,
) -> Option<String> {
    let stage = AgentStage::parse(&card.column_id)?;
    if card.archived || card.run_state != FAILED {
        return None;
    }

    let needs_review = matches!(stage, AgentStage::CodeReview | AgentStage::Rework);
    if needs_review && !snapshot.is_some_and(|snapshot| has_completed_review(card, snapshot)) {
        return None;
    }

    Some(format!("Back to {}", column_label(back_target(stage))))
}

pub(in crate::task_board) fn column_label(column: &str) -> &str {
    COLUMNS
        .iter()
        .find(|(id, _)| *id == column)
        .map_or(column, |(_, label)| label)
}
