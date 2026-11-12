use super::constants::*;
use crate::task_board::{constants::TASK, stage::agent::AgentStage};

pub struct ArtifactContract {
    pub required: &'static [&'static str],
    pub optional: &'static [&'static str],
}

pub fn input_contract(stage: AgentStage, round: i64) -> ArtifactContract {
    match stage {
        AgentStage::Grill if round <= 1 => ArtifactContract {
            required: &[TASK],
            optional: &[],
        },
        AgentStage::Grill => ArtifactContract {
            required: &[TASK, SPEC, PLAN, ANSWERS],
            optional: &[QUESTIONS],
        },
        AgentStage::Implement => ArtifactContract {
            required: &[TASK, SPEC, PLAN],
            optional: &[IMPL_REPORT],
        },
        AgentStage::CodeReview => ArtifactContract {
            required: &[TASK, SPEC, PLAN, IMPL_REPORT],
            optional: &[],
        },
        AgentStage::Rework => ArtifactContract {
            required: &[TASK, SPEC, PLAN, REWORK_BRIEF],
            optional: &[REVIEW, IMPL_REPORT],
        },
    }
}

pub fn output_contract(stage: AgentStage) -> ArtifactContract {
    match stage {
        AgentStage::Grill => ArtifactContract {
            required: &[SPEC, PLAN],
            optional: &[QUESTIONS],
        },
        AgentStage::Implement | AgentStage::Rework => ArtifactContract {
            required: &[IMPL_REPORT],
            optional: &[],
        },
        AgentStage::CodeReview => ArtifactContract {
            required: &[REVIEW],
            optional: &[PR_DESCRIPTION],
        },
    }
}
