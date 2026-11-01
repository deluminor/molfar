pub const QUEUED: &str = "queued";
pub const RUNNING: &str = "running";
pub const FAILED: &str = "failed";
pub const SUCCEEDED: &str = "succeeded";
pub const ACCEPTED: &str = "accepted";
pub const PREPARED: &str = "session_prepared";
pub const SUBMITTED: &str = "turn_submitted";
pub const SETTLED: &str = "settled";
pub(crate) const MAX_ERROR: usize = 19_000;
pub(crate) const MAX_ARTIFACT: usize = 2_000_000;
pub(crate) const ARTIFACT_KINDS: [&str; 3] = [
    crate::task_board::stage::contracts::constants::SPEC,
    crate::task_board::stage::contracts::constants::PLAN,
    crate::task_board::stage::contracts::constants::QUESTIONS,
];

pub const CANCELLED: &str = "cancelled";
pub const INTERRUPTED: &str = "interrupted";
pub const DEFAULT_CONCURRENCY: i64 = 3;
pub(crate) const MIN_CONCURRENCY: i64 = 1;
pub(crate) const MAX_CONCURRENCY: i64 = 10;
pub const DEFAULT_STALL_MINUTES: u64 = 45;
pub(crate) const MAX_STALL_MINUTES: u64 = 1440;
