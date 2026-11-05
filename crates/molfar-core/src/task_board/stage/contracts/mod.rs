pub mod constants;
pub(crate) mod output;
mod prompt;
mod prompt_bodies;
pub mod review;
mod sets;

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

pub fn build_stage_prompt(
    stage: super::agent::AgentStage,
    card: &crate::task_board::types::Card,
    files: &[types::ManifestReference],
    skills: &[String],
    head: &str,
) -> Result<String, String> {
    prompt::build(stage, card, files, skills, head)
}

#[cfg(test)]
mod stage_tests;
