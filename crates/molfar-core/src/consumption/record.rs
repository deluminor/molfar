use super::types::{TokenCounts, UsageRecord};
use crate::agent::{TurnInfo, TurnMetrics};

const LEGACY_KEY_PREFIX: &str = "legacy:";
const SLICE_SEPARATOR: char = '#';

impl From<TurnMetrics> for TokenCounts {
    fn from(metrics: TurnMetrics) -> Self {
        Self {
            input: metrics.input_tokens,
            output: metrics.output_tokens,
            cache_read: metrics.cache_read_tokens,
            cache_write: metrics.cache_write_tokens,
            cache_write_1h: None,
        }
    }
}

impl UsageRecord {
    /// A finalized live receipt. Joined steers belong to their root run and are never recorded.
    pub fn from_turn(info: &TurnInfo) -> Vec<Self> {
        if info.joined_turn.is_some() {
            return Vec::new();
        }
        let Some(key) = info.receipt_id.clone() else {
            return Vec::new();
        };

        Self::of(key, info)
    }

    /// A receipt read back from a transcript. Receipts with a live identity reuse it so a
    /// replay never double-counts; older receipts need a trustworthy start time to be keyed.
    pub fn from_saved(info: &TurnInfo) -> Vec<Self> {
        if info.joined_turn.is_some() {
            return Vec::new();
        }
        if let Some(id) = &info.receipt_id {
            if info.completion.is_none() {
                return Vec::new();
            }
            return Self::of(id.clone(), info);
        }
        let Some(started) = info.started_at else {
            return Vec::new();
        };

        Self::of(format!("{LEGACY_KEY_PREFIX}{started}"), info)
    }

    /// Per-model slices become one record each; otherwise the run's totals are one record.
    fn of(key: String, info: &TurnInfo) -> Vec<Self> {
        let base = Self {
            source_key: key,
            provider: info.provider.clone(),
            model_id: info.model_id.clone().filter(|id| !id.is_empty()),
            model_name: Some(info.model.clone()).filter(|name| !name.is_empty()),
            started_at_ms: info.started_at,
            reported_at_ms: info.completed_at.or(info.started_at),
            tier: info.service_tier.clone(),
            tokens: info
                .metrics
                .filter(|metrics| metrics.reported())
                .map(TokenCounts::from),
        };
        if info.usage_slices.is_empty() {
            return vec![base];
        }

        info.usage_slices
            .iter()
            .map(|slice| Self {
                source_key: format!("{}{SLICE_SEPARATOR}{}", base.source_key, slice.model),
                model_id: Some(slice.model.clone()),
                model_name: None,
                tokens: Some(slice.tokens),
                ..base.clone()
            })
            .collect()
    }
}
