use super::types::CheckoutSnapshot;
use crate::task_board::{stage::agent::AgentStage, types::StageRun};

pub const DIRTY_CHECKOUT: &str =
    "The card's worktree has uncommitted changes. Commit or discard them first.";

pub fn clean(snapshot: &CheckoutSnapshot) -> Result<(), String> {
    if snapshot.porcelain.trim().is_empty() {
        Ok(())
    } else {
        Err(DIRTY_CHECKOUT.into())
    }
}

pub fn before(stage: AgentStage, snapshot: &CheckoutSnapshot) -> Result<(), String> {
    if stage.is_read_only() {
        return Ok(());
    }
    clean(snapshot)
}

pub fn after(
    stage: AgentStage,
    before: &CheckoutSnapshot,
    after: &CheckoutSnapshot,
) -> Result<(), String> {
    if stage.is_read_only() {
        if before != after {
            return Err(format!(
                "{} changed its read-only checkout. Retained changes were not removed.",
                stage.label()
            ));
        }
    } else {
        if !after.porcelain.trim().is_empty() {
            return Err(
                "The stage left uncommitted changes. Commit or discard them, then retry.".into(),
            );
        }
        if before.head == after.head {
            return Err("The stage made no new commit.".into());
        }
    }
    Ok(())
}

pub fn verify_run(run: &StageRun, after: &CheckoutSnapshot) -> Result<AgentStage, String> {
    let stage = AgentStage::parse(&run.stage).ok_or("Unsupported Board stage.")?;
    let before = CheckoutSnapshot {
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

    self::before(stage, &before)?;
    self::after(stage, &before, after)?;
    Ok(stage)
}
