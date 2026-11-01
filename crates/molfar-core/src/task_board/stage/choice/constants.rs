use crate::task_board::stage::agent::AgentStage;

pub const RUNTIME_MODES: [&str; 4] = ["supervised", "auto-accept-edits", "auto", "full-access"];
pub(crate) const DEFAULT_RUNTIME_MODE: &str = "auto";
pub(crate) const CONFIG_FIELDS: [&str; 4] = ["harness", "model", "effort", "runtimeMode"];

pub(crate) fn stage_skills(stage: AgentStage) -> [&'static str; 3] {
    match stage {
        AgentStage::Grill => ["d-plan", "d-grill-me", "d-analyze"],
        AgentStage::Implement | AgentStage::Rework => ["d-tdd", "d-verify", "d-lean-code"],
        AgentStage::CodeReview => [
            "d-code-review",
            "d-security-review",
            "d-merge-request-writer",
        ],
    }
}
pub(crate) const MAX_LABEL: usize = 200;
pub(crate) const MAX_SKILL_NAME: usize = 64;
pub(crate) const MAX_SKILLS_PER_COLUMN: usize = 32;
pub(crate) const MAX_OVERRIDES: usize = 20_000;
