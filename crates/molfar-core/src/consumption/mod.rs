#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct UsageSnapshot {
    /// Stable provider run/message identity; never a transcript row index.
    pub source_key: String,
    pub provider: String,
    pub model: Option<String>,
    pub reported_at_ms: Option<u64>,
    pub input: Option<u64>,
    pub output: Option<u64>,
    pub cache_read: Option<u64>,
    pub cache_write: Option<u64>,
}

impl UsageSnapshot {
    pub fn validate(&self) -> Result<(), String> {
        if self.source_key.trim().is_empty() || self.provider.trim().is_empty() {
            return Err("Consumption requires provider and stable source identity".into());
        }
        for value in [
            self.reported_at_ms,
            self.input,
            self.output,
            self.cache_read,
            self.cache_write,
        ]
        .into_iter()
        .flatten()
        {
            i64::try_from(value).map_err(|_| "Consumption exceeds SQLite integer range")?;
        }
        Ok(())
    }
}
