use super::*;
use molfar_core::{
    agent::turn::TurnCompletion,
    task_board::stage::{
        checkout, contracts,
        lifecycle::types::{FailureStatus, StageContext, StageEffect, VerifiedStageOutput},
    },
};

const INTERRUPTED: &str =
    "Stage interrupted before a durable completion. Retry explicitly; the prompt was not replayed.";

pub(super) fn settle(
    store: &Database,
    context: &StageContext,
    active: &HashSet<String>,
) -> Result<StageEffect, String> {
    let run = &context.run.id;
    let Some(result) = locked(store)?.board_stage_result(run)? else {
        return interrupt_unless_active(store, context, active);
    };

    locked(store)?.board_record_stage_submitted(run)?;
    match result.completion {
        Some(TurnCompletion::Succeeded { .. }) => match verify(context, &result.text) {
            Ok(output) => {
                let finished = locked(store)?.board_finish_stage(run, &output);
                finished.or_else(|error| {
                    let message = format!("Saving stage artifacts failed: {error}");
                    locked(store)?.board_fail_stage(run, FailureStatus::Failed, &message)
                })
            }
            Err(error) => locked(store)?.board_fail_stage(run, FailureStatus::Failed, &error),
        },
        Some(TurnCompletion::Failed { error, .. }) => {
            locked(store)?.board_fail_stage(run, FailureStatus::Failed, &error)
        }
        Some(TurnCompletion::Cancelled { .. }) => {
            locked(store)?.board_fail_stage(run, FailureStatus::Cancelled, "Stage cancelled")
        }
        None => interrupt_unless_active(store, context, active),
    }
}

fn verify(context: &StageContext, text: &str) -> Result<VerifiedStageOutput, String> {
    let path = context
        .card
        .worktree_path
        .as_deref()
        .ok_or("Stage worktree is missing")?;
    let after = checkout::snapshot(std::path::Path::new(path))?;
    let run = &context.run;
    let stage = molfar_core::task_board::stage::agent::AgentStage::parse(&run.stage)
        .ok_or("Unsupported Board stage.")?;
    let before = molfar_core::task_board::stage::checkout::types::CheckoutSnapshot {
        head: run
            .head_before
            .clone()
            .ok_or("Stage has no starting HEAD.")?,
        porcelain: run
            .porcelain_before
            .clone()
            .ok_or("Stage has no starting checkout state.")?,
        fingerprint: run
            .fingerprint_before
            .clone()
            .ok_or("Stage has no starting fingerprint.")?,
    };
    checkout::policy::before(stage, &before)?;
    checkout::policy::after(stage, &before, &after)?;
    let artifacts = contracts::read_stage_output(stage, text)?;
    Ok(VerifiedStageOutput { artifacts, after })
}

pub(super) fn is_active(context: &StageContext, active: &HashSet<String>) -> bool {
    context
        .run
        .session_id
        .as_ref()
        .is_some_and(|id| active.contains(id))
}

fn interrupt_unless_active(
    store: &Database,
    context: &StageContext,
    active: &HashSet<String>,
) -> Result<StageEffect, String> {
    if is_active(context, active) {
        return Ok(StageEffect::default());
    }

    locked(store)?.board_fail_stage(&context.run.id, FailureStatus::Interrupted, INTERRUPTED)
}
