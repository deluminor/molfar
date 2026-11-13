use super::types::{TokenCounts, UsageRecord};
use crate::agent::{TurnInfo, TurnMetrics};

const LEGACY_KEY_PREFIX: &str = "legacy:";

impl From<TurnMetrics> for TokenCounts {
    fn from(metrics: TurnMetrics) -> Self {
        Self {
            input: metrics.input_tokens,
            output: metrics.output_tokens,
            cache_read: metrics.cache_read_tokens,
            cache_write: metrics.cache_write_tokens,
        }
    }
}

impl UsageRecord {
    /// A finalized live receipt. Joined steers belong to their root run and are never recorded.
    pub fn from_turn(info: &TurnInfo) -> Option<Self> {
        if info.joined_turn.is_some() {
            return None;
        }
        let key = info.receipt_id.clone()?;

        Some(Self::of(key, info))
    }

    /// A receipt read back from a transcript. Receipts with a live identity reuse it so a
    /// replay never double-counts; older receipts need a trustworthy start time to be keyed.
    pub fn from_saved(info: &TurnInfo) -> Option<Self> {
        if info.joined_turn.is_some() {
            return None;
        }
        if let Some(id) = &info.receipt_id {
            return info
                .completion
                .is_some()
                .then(|| Self::of(id.clone(), info));
        }
        let started = info.started_at?;

        Some(Self::of(format!("{LEGACY_KEY_PREFIX}{started}"), info))
    }

    fn of(source_key: String, info: &TurnInfo) -> Self {
        Self {
            source_key,
            provider: info.provider.clone(),
            model_id: info.model_id.clone().filter(|id| !id.is_empty()),
            model_name: Some(info.model.clone()).filter(|name| !name.is_empty()),
            started_at_ms: info.started_at,
            reported_at_ms: info.completed_at.or(info.started_at),
            tokens: info
                .metrics
                .filter(|metrics| metrics.reported())
                .map(TokenCounts::from),
        }
    }
}
