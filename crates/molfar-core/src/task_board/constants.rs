pub const COLUMNS: [(&str, &str); 8] = [
    (BACKLOG, "Backlog"),
    (GRILL, "Grill"),
    (PLAN_APPROVAL, "Plan approval"),
    (IMPLEMENT, "Implement"),
    (CODE_REVIEW, "Code review"),
    (FINAL_REVIEW, "Final review"),
    (REWORK, "Rework"),
    (DONE, "Done"),
];

pub const BACKLOG: &str = "backlog";
pub const GRILL: &str = "grill";
pub const PLAN_APPROVAL: &str = "plan_approval";
pub const IMPLEMENT: &str = "implement";
pub const CODE_REVIEW: &str = "code_review";
pub const FINAL_REVIEW: &str = "final_review";
pub const REWORK: &str = "rework";
pub const DONE: &str = "done";
pub const IDLE: &str = "idle";
pub(crate) const TASK: &str = "task";
pub const USER: &str = "user";
pub const ENGINE: &str = "engine";
/// Rework briefs the engine wrote because the verify command or CI failed.
pub const CHECKS: &str = "checks";
pub(crate) const INITIAL_VERSION: i64 = 1;
pub(crate) const MAX_TITLE: usize = 200;
pub(crate) const MAX_DESCRIPTION: usize = 100_000;
pub(crate) const MAX_CRITERIA: usize = 50_000;
pub(crate) const MAX_PATH: usize = 4_096;
pub(crate) const MAX_REF: usize = 255;
