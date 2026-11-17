pub const QUEUED: &str = "queued";
pub const RUNNING: &str = "running";
pub const FAILED: &str = "failed";
pub const SUCCEEDED: &str = "succeeded";
/// A writing run that reported unfinished work; the engine queued a continuation.
pub const PARTIAL: &str = "partial";
/// A code review that never ran because the verify command failed; the card went back to Rework.
pub const REDIRECTED: &str = "redirected";
pub(crate) const MAX_AUTO_REWORK: usize = 2;
pub(crate) const MAX_CHECK_REWORK: usize = 2;
/// Implement, Rework and Code review turns the engine may start since the user last decided.
pub(crate) const MAX_AUTOMATIC_TURNS: i64 = 20;
/// Compactions MOLFAR may trigger within one stage run before it stops for the user.
pub(crate) const MAX_COMPACTIONS: usize = 3;
/// Per-run marker in the settings store: MOLFAR reset this run's context before its prompt.
pub(crate) const COMPACTION_MARKER: &str = "board-run-compacted:";
/// Context share at which a reused session is compacted before the next run.
pub(crate) const COMPACT_AT: f32 = 0.75;
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
