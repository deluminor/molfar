use serde::{Deserialize, Serialize};

/// Raw counters exactly as the harness reported them; pricing owns provider semantics.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct TokenCounts {
    pub input: u64,
    pub output: u64,
    pub cache_read: u64,
    /// Every cache write, whatever its lifetime.
    pub cache_write: u64,
    /// The part of `cache_write` with a one-hour lifetime; `None` when the harness did not say.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cache_write_1h: Option<u64>,
}

impl TokenCounts {
    pub fn checked_add(self, other: Self) -> Option<Self> {
        Some(Self {
            input: self.input.checked_add(other.input)?,
            output: self.output.checked_add(other.output)?,
            cache_read: self.cache_read.checked_add(other.cache_read)?,
            cache_write: self.cache_write.checked_add(other.cache_write)?,
            cache_write_1h: match (self.cache_write_1h, other.cache_write_1h) {
                (Some(a), Some(b)) => Some(a.checked_add(b)?),
                _ => None,
            },
        })
    }

    pub fn total(self) -> Option<u64> {
        self.input
            .checked_add(self.output)?
            .checked_add(self.cache_read)?
            .checked_add(self.cache_write)
    }
}

/// One model's share of a run, as the harness reported it.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct UsageSlice {
    pub model: String,
    pub tokens: TokenCounts,
}

/// One provider run, keyed by its receipt identity (never a transcript row index).
/// `tokens` is `None` when the harness reported nothing for that run.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct UsageRecord {
    pub source_key: String,
    pub provider: String,
    pub model_id: Option<String>,
    pub model_name: Option<String>,
    pub started_at_ms: Option<u64>,
    pub reported_at_ms: Option<u64>,
    /// `standard`, `fast`, `flex`…; `None` when the run did not record one (priced as standard).
    pub tier: Option<String>,
    pub tokens: Option<TokenCounts>,
}

impl UsageRecord {
    pub fn validate(&self) -> Result<(), String> {
        if self.source_key.trim().is_empty() || self.provider.trim().is_empty() {
            return Err(format!(
                "Consumption requires provider and stable source identity (source={:?})",
                self.source_key
            ));
        }
        let tokens = self.tokens.unwrap_or_default();
        let values = [
            self.started_at_ms.unwrap_or(0),
            self.reported_at_ms.unwrap_or(0),
            tokens.input,
            tokens.output,
            tokens.cache_read,
            tokens.cache_write,
            tokens.cache_write_1h.unwrap_or(0),
        ];
        if values.iter().any(|value| i64::try_from(*value).is_err()) {
            return Err(format!(
                "Consumption source={} exceeds the SQLite integer range",
                self.source_key
            ));
        }
        if tokens
            .cache_write_1h
            .is_some_and(|long| long > tokens.cache_write)
        {
            return Err(format!(
                "Consumption source={} reports more one-hour cache writes than writes",
                self.source_key
            ));
        }
        tokens.total().map(|_| ()).ok_or_else(|| {
            format!(
                "Consumption source={} overflows its token total",
                self.source_key
            )
        })
    }
}
