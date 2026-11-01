pub(crate) mod config;
mod resolve;
mod skills;
pub mod types;

#[cfg(test)]
mod tests;

pub fn select(
    settings_json: Option<&str>,
    overrides_json: &str,
    default_kind: crate::provider::Kind,
) -> Result<types::GrillSelection, String> {
    config::selection(settings_json, overrides_json, default_kind)
}

pub fn resolve(
    selection: &types::GrillSelection,
    defaults: crate::agent::Settings,
    models: &[crate::catalog::Model],
    available_skills: &std::collections::HashSet<String>,
    provider_available: bool,
) -> Result<types::ResolvedGrillChoice, String> {
    resolve::resolve(
        selection,
        defaults,
        models,
        available_skills,
        provider_available,
    )
}
