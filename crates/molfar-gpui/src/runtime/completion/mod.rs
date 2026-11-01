use molfar_core::agent::turn::TurnCompletion;

#[cfg(test)]
mod tests;

pub(super) fn classify(
    completed_at: u64,
    cancelled: bool,
    provider_error: Option<&str>,
    flush_error: Option<&str>,
    handoff_error: Option<&str>,
) -> TurnCompletion {
    let storage_error = match (flush_error, handoff_error) {
        (Some(flush), Some(handoff)) => Some(format!(
            "Saving transcript failed: {flush} · Saving handoff failed: {handoff}"
        )),
        (Some(flush), None) => Some(format!("Saving transcript failed: {flush}")),
        (None, Some(handoff)) => Some(format!("Saving handoff failed: {handoff}")),
        (None, None) => None,
    };
    if let Some(error) = storage_error {
        return TurnCompletion::Failed {
            completed_at,
            error,
        };
    }

    if cancelled {
        return TurnCompletion::Cancelled { completed_at };
    }

    if let Some(error) = provider_error {
        return TurnCompletion::Failed {
            completed_at,
            error: error.into(),
        };
    }

    TurnCompletion::Succeeded { completed_at }
}
