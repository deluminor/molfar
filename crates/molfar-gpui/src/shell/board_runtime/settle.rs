use super::*;
use molfar_core::{
    agent::turn::TurnCompletion,
    task_board::stage::{
        checkout, contracts,
        lifecycle::types::{FailureStatus, GrillContext, StageEffect, VerifiedGrillOutput},
    },
};

const INTERRUPTED: &str =
    "Stage interrupted before a durable completion. Retry explicitly; the prompt was not replayed.";

pub(super) fn settle(
    store: &Database,
    context: &GrillContext,
    active: &HashSet<String>,
) -> Result<StageEffect, String> {
    let run = &context.run.id;
    let Some(result) = locked(store)?.board_grill_result(run)? else {
        return interrupt_unless_active(store, context, active);
    };

    locked(store)?.board_record_grill_submitted(run)?;
    match result.completion {
        Some(TurnCompletion::Succeeded { .. }) => match verify(context, &result.text) {
            Ok(output) => {
                let finished = locked(store)?.board_finish_grill(run, &output);
                finished.or_else(|error| {
                    let message = format!("Saving stage artifacts failed: {error}");
                    locked(store)?.board_fail_grill(run, FailureStatus::Failed, &message)
                })
            }
            Err(error) => locked(store)?.board_fail_grill(run, FailureStatus::Failed, &error),
        },
        Some(TurnCompletion::Failed { error, .. }) => {
            locked(store)?.board_fail_grill(run, FailureStatus::Failed, &error)
        }
        Some(TurnCompletion::Cancelled { .. }) => {
            locked(store)?.board_fail_grill(run, FailureStatus::Cancelled, "Stage cancelled")
        }
        None => interrupt_unless_active(store, context, active),
    }
}

fn verify(context: &GrillContext, text: &str) -> Result<VerifiedGrillOutput, String> {
    let path = context
        .card
        .worktree_path
        .as_deref()
        .ok_or("Stage worktree is missing")?;
    let after = checkout::snapshot(std::path::Path::new(path))?;
    let run = &context.run;
    let unchanged = run.head_before.as_deref() == Some(&after.head)
        && run.porcelain_before.as_deref() == Some(&after.porcelain)
        && run.fingerprint_before.as_deref() == Some(&after.fingerprint);
    if !unchanged {
        return Err(
            "Grill changed its read-only checkout. Retained changes were not removed.".into(),
        );
    }

    let artifacts = contracts::read_grill_output(text)?;
    Ok(VerifiedGrillOutput { artifacts, after })
}

pub(super) fn is_active(context: &GrillContext, active: &HashSet<String>) -> bool {
    context
        .run
        .session_id
        .as_ref()
        .is_some_and(|id| active.contains(id))
}

fn interrupt_unless_active(
    store: &Database,
    context: &GrillContext,
    active: &HashSet<String>,
) -> Result<StageEffect, String> {
    if is_active(context, active) {
        return Ok(StageEffect::default());
    }

    locked(store)?.board_fail_grill(&context.run.id, FailureStatus::Interrupted, INTERRUPTED)
}
