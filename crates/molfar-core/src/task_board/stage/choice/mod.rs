pub(crate) mod config;
mod constants;
mod resolve;
mod skills;
pub mod types;

#[cfg(test)]
mod stage_tests;
#[cfg(test)]
mod tests;

pub fn select(
    stage: crate::task_board::stage::agent::AgentStage,
    settings_json: Option<&str>,
    overrides_json: &str,
    default_kind: crate::provider::Kind,
) -> Result<types::StageSelection, String> {
    config::selection(stage, settings_json, overrides_json, default_kind)
}

pub fn resolve(
    selection: &types::StageSelection,
    defaults: crate::agent::Settings,
    models: &[crate::catalog::Model],
    available_skills: &std::collections::HashSet<String>,
    provider_available: bool,
) -> Result<types::ResolvedStageChoice, String> {
    resolve::resolve(
        selection,
        defaults,
        models,
        available_skills,
        provider_available,
    )
}
