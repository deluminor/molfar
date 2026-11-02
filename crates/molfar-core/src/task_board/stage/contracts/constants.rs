pub const TEMPLATE_VERSION: i64 = 3;
pub const SPEC: &str = "spec";
pub const PLAN: &str = "plan";
pub const QUESTIONS: &str = "questions";

pub const ANSWERS: &str = "answers";
pub const IMPL_REPORT: &str = "impl_report";
pub const REVIEW: &str = "review";
pub const REWORK_BRIEF: &str = "rework_brief";
pub const PR_DESCRIPTION: &str = "pr_description";
pub(crate) const SAVED_KINDS: [&str; 9] = [
    crate::task_board::constants::TASK,
    SPEC,
    PLAN,
    QUESTIONS,
    ANSWERS,
    IMPL_REPORT,
    REVIEW,
    REWORK_BRIEF,
    PR_DESCRIPTION,
];
