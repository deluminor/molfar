pub mod constants;
pub(crate) mod output;
mod prompt;
pub mod types;

#[cfg(test)]
mod tests;

pub fn read_grill_output(text: &str) -> Result<Vec<types::ParsedArtifact>, String> {
    output::read(text)
}

pub fn build_grill_prompt(
    card: &crate::task_board::types::Card,
    files: &[types::ManifestReference],
    skills: &[String],
) -> Result<String, String> {
    prompt::build(card, files, skills)
}
