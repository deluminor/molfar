#[cfg(test)]
mod tests;
pub mod types;

use super::{
    agent::AgentStage,
    lifecycle::constants::{FAILED, QUEUED, RUNNING},
};
use crate::task_board::constants::{
    BACKLOG, CODE_REVIEW, DONE, FINAL_REVIEW, GRILL, IDLE, IMPLEMENT, PLAN_APPROVAL, REWORK,
};
use types::{
    BoardAction, BoardAction::*, Position, Transition, TransitionEffect, TransitionEffect::*,
};

pub fn back_target(stage: AgentStage) -> &'static str {
    match stage {
        AgentStage::Grill => BACKLOG,
        AgentStage::Implement => PLAN_APPROVAL,
        AgentStage::CodeReview | AgentStage::Rework => FINAL_REVIEW,
    }
}

fn after_success(stage: AgentStage) -> (&'static str, &'static str) {
    match stage {
        AgentStage::Grill => (PLAN_APPROVAL, IDLE),
        AgentStage::Implement | AgentStage::Rework => (CODE_REVIEW, QUEUED),
        AgentStage::CodeReview => (FINAL_REVIEW, IDLE),
    }
}

fn move_to(
    column: &str,
    run_state: &'static str,
    effects: &[TransitionEffect],
) -> Option<Transition> {
    Some(Transition {
        column: column.to_owned(),
        run_state,
        archived: false,
        effects: effects.to_vec(),
    })
}

fn agent_transition(card: Position<'_>, action: BoardAction) -> Option<Transition> {
    let stage = AgentStage::parse(card.column)?;

    match (action, card.run_state) {
        (StageSucceeded, RUNNING) => {
            let (column, state) = after_success(stage);
            move_to(column, state, &[ClearError])
        }
        (StageFailed, RUNNING) => move_to(card.column, FAILED, &[]),
        (Retry, FAILED) => move_to(card.column, QUEUED, &[ClearError]),
        (Back, FAILED) => move_to(back_target(stage), IDLE, &[ClearError]),
        (Cancel, RUNNING) => move_to(card.column, FAILED, &[StopSession]),
        (Cancel, QUEUED) => move_to(card.column, FAILED, &[]),
        _ => None,
    }
}

fn gate_transition(card: Position<'_>, action: BoardAction) -> Option<Transition> {
    let idle = card.run_state == IDLE;
    let reviewable = idle || card.run_state == FAILED;

    match (card.column, action) {
        (BACKLOG, Start) if idle => move_to(GRILL, QUEUED, &[EnsureWorktree, ResetGrillRound]),
        (BACKLOG | PLAN_APPROVAL, EditTask) if idle => move_to(card.column, IDLE, &[]),
        (PLAN_APPROVAL, Answer | RequestChanges) if idle => {
            move_to(GRILL, QUEUED, &[NextGrillRound])
        }
        (PLAN_APPROVAL, ApprovePlan) if idle => move_to(IMPLEMENT, QUEUED, &[]),
        (PLAN_APPROVAL, EditPlan) if idle => move_to(card.column, IDLE, &[]),
        (FINAL_REVIEW, Rework) if reviewable => {
            move_to(REWORK, QUEUED, &[NextReworkCycle, ClearError])
        }
        // Delivery holds the card in running so a concurrent second deliver is refused.
        (FINAL_REVIEW, DeliverStart) if reviewable => move_to(card.column, RUNNING, &[ClearError]),
        (FINAL_REVIEW, Deliver) if card.run_state == RUNNING => {
            move_to(DONE, IDLE, &[CleanupWorktree, ClearError])
        }
        (FINAL_REVIEW, DeliveryFailed) if card.run_state == RUNNING => {
            move_to(card.column, FAILED, &[])
        }
        _ => None,
    }
}

pub fn transition(card: Position<'_>, action: BoardAction) -> Result<Transition, String> {
    let refuse = || {
        format!(
            "Cannot {} a card in {} ({}).",
            action.id(),
            card.column,
            card.run_state
        )
    };
    if card.archived {
        return Err("The card is archived.".into());
    }

    if action == Reject {
        if card.run_state == RUNNING {
            return Err(refuse());
        }
        // Done cards archive without cleanup; delivery already dropped the worktree.
        let effects = if card.column == DONE {
            Vec::new()
        } else {
            vec![CleanupWorktree]
        };
        return Ok(Transition {
            column: card.column.to_owned(),
            run_state: IDLE,
            archived: true,
            effects,
        });
    }

    agent_transition(card, action)
        .or_else(|| gate_transition(card, action))
        .ok_or_else(refuse)
}
