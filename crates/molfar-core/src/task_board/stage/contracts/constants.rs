pub const TEMPLATE_VERSION: i64 = 3;
pub const SPEC: &str = "spec";
pub const PLAN: &str = "plan";
pub const QUESTIONS: &str = "questions";

pub const ANSWERS: &str = "answers";
pub(crate) const SAVED_KINDS: [&str; 5] = [
    crate::task_board::constants::TASK,
    SPEC,
    PLAN,
    QUESTIONS,
    ANSWERS,
];
