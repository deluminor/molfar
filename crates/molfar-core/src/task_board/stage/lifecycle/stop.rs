//! Why the engine ended a stage run. Only signals the engine observes itself end a run;
//! an agent that reports `partial` gets another turn instead.
use super::{
    constants::{MAX_AUTOMATIC_TURNS, MAX_COMPACTIONS},
    types::FailureStatus,
};

/// Every engine stop message starts with this, followed by the reason's label.
pub const STOPPED_PREFIX: &str = "Stopped — ";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StopReason {
    CompactionCap,
    UsageLimit,
    ContextLimit,
    RunFailed,
    Interrupted,
    Cancelled,
    Blocked,
    Budget,
}

impl StopReason {
    pub fn label(self) -> &'static str {
        match self {
            Self::CompactionCap => "context compaction limit",
            Self::UsageLimit => "provider usage limit",
            Self::ContextLimit => "provider context limit",
            Self::RunFailed => "run failed",
            Self::Interrupted => "interrupted",
            Self::Cancelled => "cancelled",
            Self::Blocked => "blocked",
            Self::Budget => "automatic turn budget",
        }
    }

    pub(crate) fn message(self, detail: &str) -> String {
        format!("{STOPPED_PREFIX}{}: {detail}", self.label())
    }
}

// Lowercase fragments of provider errors; context comes first because some providers
// phrase a full window as "too many tokens", which also reads like a rate limit.
const CONTEXT_LIMIT: [&str; 8] = [
    "context window",
    "context length",
    "context_length_exceeded",
    "maximum context",
    "context limit",
    "prompt is too long",
    "input is too long",
    "too many tokens",
];
const USAGE_LIMIT: [&str; 7] = [
    "usage limit",
    "rate limit",
    "rate_limit",
    "session limit",
    "weekly limit",
    "quota",
    "too many requests",
];

pub(crate) fn classify(status: FailureStatus, error: &str) -> StopReason {
    match status {
        FailureStatus::Cancelled => return StopReason::Cancelled,
        FailureStatus::Interrupted => return StopReason::Interrupted,
        FailureStatus::Failed => {}
    }
    let error = error.to_lowercase();
    let mentions = |fragments: &[&str]| fragments.iter().any(|part| error.contains(part));
    if mentions(&CONTEXT_LIMIT) {
        return StopReason::ContextLimit;
    }
    if mentions(&USAGE_LIMIT) {
        return StopReason::UsageLimit;
    }
    StopReason::RunFailed
}

/// The card's error for a failed turn: its reason label, then the original text.
pub(crate) fn labeled(status: FailureStatus, error: &str) -> String {
    if error.starts_with(STOPPED_PREFIX) {
        return error.into();
    }
    classify(status, error).message(error)
}

pub(crate) fn blocked() -> String {
    StopReason::Blocked.message(
        "The agent reported it is blocked. Read the implementation report, resolve the blocker, then Retry.",
    )
}

pub(crate) fn budget() -> String {
    StopReason::Budget.message(&format!(
        "Automatic budget used: {MAX_AUTOMATIC_TURNS} agent turns since your last decision. Review the card, then Retry, request a rework or edit the plan to continue."
    ))
}

pub(crate) fn compaction_cap() -> String {
    StopReason::CompactionCap.message(&format!(
        "Context compaction limit reached: {MAX_COMPACTIONS} of {MAX_COMPACTIONS} compactions used. Read the implementation report, then Retry to continue in a fresh session."
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn provider_failures_get_their_own_label_and_keep_the_original_text() {
        let claude = crate::provider::limits::CLAUDE_USAGE_LIMIT;
        let codex = "You've hit your usage limit. Upgrade to Pro or try again later.";
        let rate = "429 Too Many Requests: rate_limit_exceeded";
        for error in [claude, codex, rate] {
            assert_eq!(
                classify(FailureStatus::Failed, error),
                StopReason::UsageLimit
            );
        }
        let window = "prompt is too long: 210000 tokens > 200000 maximum";
        let openai =
            "This model's maximum context length is 400000 tokens (context_length_exceeded)";
        for error in [window, openai] {
            assert_eq!(
                classify(FailureStatus::Failed, error),
                StopReason::ContextLimit
            );
        }

        let message = labeled(FailureStatus::Failed, claude);
        assert!(message.starts_with("Stopped — provider usage limit: "));
        assert!(message.ends_with(claude));
    }

    #[test]
    fn cancel_interrupt_and_unknown_errors_are_labeled_without_guessing() {
        assert_eq!(
            classify(FailureStatus::Cancelled, "usage limit"),
            StopReason::Cancelled
        );
        assert_eq!(
            classify(FailureStatus::Interrupted, "anything"),
            StopReason::Interrupted
        );
        assert_eq!(
            classify(FailureStatus::Failed, "Codex exited with status 1"),
            StopReason::RunFailed
        );
        assert_eq!(
            labeled(FailureStatus::Failed, &blocked()),
            blocked(),
            "an engine stop is never labeled twice"
        );
        assert!(blocked().starts_with("Stopped — blocked: "));
        assert!(budget().contains("20 agent turns"));
        assert!(compaction_cap().contains("3 of 3 compactions used"));
    }
}
