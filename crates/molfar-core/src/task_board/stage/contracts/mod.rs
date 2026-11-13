pub mod constants;
pub(crate) mod output;
mod prompt;
mod prompt_bodies;
pub mod review;
mod sets;
pub mod status;

pub use sets::{input_contract, output_contract};
pub mod types;

#[cfg(test)]
mod tests;

pub fn read_stage_output(
    stage: super::agent::AgentStage,
    text: &str,
) -> Result<Vec<types::ParsedArtifact>, String> {
    output::read(stage, text)
}

/// True when a writing stage's final message reports `Status: blocked`; such a run may
/// legitimately end without a commit, so callers explain the blocker instead.
pub fn reported_blocked(stage: super::agent::AgentStage, text: &str) -> bool {
    output::read(stage, text)
        .ok()
        .and_then(|artifacts| {
            artifacts
                .into_iter()
                .find(|artifact| artifact.kind == constants::IMPL_REPORT)
        })
        .and_then(|report| status::parse(&report.body).ok())
        == Some(status::ImplStatus::Blocked)
}

pub fn build_stage_prompt(
    stage: super::agent::AgentStage,
    card: &crate::task_board::types::Card,
    files: &[types::ManifestReference],
    skills: &[String],
    head: &str,
    extras: &types::PromptExtras,
) -> Result<String, String> {
    prompt::build(stage, card, files, skills, head, extras)
}

#[cfg(test)]
mod prompt_tests;
#[cfg(test)]
mod stage_tests;
