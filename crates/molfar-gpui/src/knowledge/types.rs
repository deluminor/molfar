use chrono::{DateTime, Local};

/// What the last scan reported about the index itself.
#[derive(Clone, Debug, Default)]
pub(crate) struct ScanMeta {
    pub warnings: Vec<String>,
    pub truncated: bool,
    pub scanned_at: Option<DateTime<Local>>,
}

/// Vault-wide link health, independent of the search.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub(crate) struct GraphStats {
    pub links: usize,
    pub orphans: usize,
    pub missing: usize,
    pub ambiguous: usize,
}
