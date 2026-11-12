pub const QUEUED: &str = "queued";
pub const RUNNING: &str = "running";
pub const FAILED: &str = "failed";
pub const SUCCEEDED: &str = "succeeded";
/// A writing run that reported unfinished work; the engine queued a continuation.
pub const PARTIAL: &str = "partial";
pub(crate) const MAX_CONTINUATIONS: usize = 3;
pub(crate) const MAX_AUTO_REWORK: usize = 2;
pub const ACCEPTED: &str = "accepted";
pub const PREPARED: &str = "session_prepared";
pub const SUBMITTED: &str = "turn_submitted";
pub const SETTLED: &str = "settled";
pub(crate) const MAX_ERROR: usize = 19_000;
pub(crate) const MAX_ARTIFACT: usize = 2_000_000;

pub const CANCELLED: &str = "cancelled";
/// Every stale-revision refusal starts with this, so owner panels can offer a reload.
pub const CONFLICT_PREFIX: &str = "conflict:";
pub const INTERRUPTED: &str = "interrupted";
pub const DEFAULT_CONCURRENCY: i64 = 3;
pub(crate) const MIN_CONCURRENCY: i64 = 1;
pub(crate) const MAX_CONCURRENCY: i64 = 10;
pub const DEFAULT_STALL_MINUTES: u64 = 45;
pub(crate) const MAX_STALL_MINUTES: u64 = 1440;

pub(crate) const STAGE_SOURCE: &str = "stage";
