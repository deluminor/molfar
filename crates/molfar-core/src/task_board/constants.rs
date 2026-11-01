pub const COLUMNS: [(&str, &str); 8] = [
    (BACKLOG, "Backlog"),
    ("grill", "Grill"),
    ("plan_approval", "Plan approval"),
    ("implement", "Implement"),
    ("code_review", "Code review"),
    ("final_review", "Final review"),
    ("rework", "Rework"),
    ("done", "Done"),
];

pub const BACKLOG: &str = "backlog";
pub const IDLE: &str = "idle";
pub(crate) const TASK: &str = "task";
pub(crate) const USER: &str = "user";
pub(crate) const INITIAL_VERSION: i64 = 1;
pub(crate) const MAX_TITLE: usize = 200;
pub(crate) const MAX_DESCRIPTION: usize = 100_000;
pub(crate) const MAX_CRITERIA: usize = 50_000;
pub(crate) const MAX_PATH: usize = 4_096;
pub(crate) const MAX_REF: usize = 255;
