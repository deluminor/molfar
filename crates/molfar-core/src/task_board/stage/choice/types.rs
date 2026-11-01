use crate::{agent::Settings, provider::Kind, task_board::stage::agent::AgentStage};
use serde_json::Value;

#[derive(Clone, Debug)]
pub struct StageSelection {
    pub stage: AgentStage,
    pub kind: Kind,
    pub default_kind: Kind,
    pub input: Value,
    pub configured_skills: Option<Vec<String>>,
}

#[derive(Clone, Debug)]
pub struct ResolvedStageChoice {
    pub kind: Kind,
    pub model: String,
    pub settings: Settings,
    pub runtime_mode: String,
    pub skills: Vec<String>,
    pub warnings: Vec<String>,
    pub model_settings: Value,
}
