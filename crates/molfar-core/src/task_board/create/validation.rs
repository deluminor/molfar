use super::super::{
    constants::{MAX_CRITERIA, MAX_DESCRIPTION, MAX_PATH, MAX_REF, MAX_TITLE},
    types::CardCreate,
};
use std::path::Path;

pub(crate) fn id(value: &str) -> Result<(), String> {
    if value.is_empty()
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        return Err("Invalid card id.".into());
    }

    Ok(())
}

pub(super) fn normalize(input: &CardCreate, projects: &[String]) -> Result<CardCreate, String> {
    let input = fields(input)?;
    let cwd = &input.project_cwd;
    if cwd.trim().is_empty() || cwd.len() > MAX_PATH || cwd.contains('\0') {
        return Err("Invalid project.".into());
    }
    if crate::files::remote::is_remote(Path::new(cwd)) {
        return Err("Task Board supports local projects only.".into());
    }
    if !projects
        .iter()
        .any(|path| crate::files::path_key(path) == crate::files::path_key(cwd))
    {
        return Err("Choose one of the projects on the rail.".into());
    }

    crate::git::snapshot(Path::new(cwd))
        .map_err(|error| format!("Choose a git project with at least one commit ({error})."))?;
    crate::git::git(Path::new(cwd), &["rev-parse", "--verify", "HEAD^{commit}"])
        .map_err(|error| format!("Choose a git project with at least one commit ({error})."))?;
    Ok(input)
}

/// Trims and bounds the owner-written fields shared by create and edit.
pub(crate) fn fields(input: &CardCreate) -> Result<CardCreate, String> {
    let input = CardCreate {
        id: input.id.clone(),
        project_cwd: input.project_cwd.clone(),
        title: input.title.trim().into(),
        description: input.description.trim().into(),
        acceptance_criteria: input.acceptance_criteria.trim().into(),
        base_ref: input
            .base_ref
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_owned),
    };
    for (value, max, label) in [
        (&input.title, MAX_TITLE, "Title"),
        (&input.description, MAX_DESCRIPTION, "Description"),
    ] {
        if value.is_empty() || value.len() > max {
            return Err(format!(
                "{label} is required and must be under {max} bytes."
            ));
        }
    }
    if input.acceptance_criteria.len() > MAX_CRITERIA {
        return Err("Acceptance criteria are too long.".into());
    }
    if let Some(value) = &input.base_ref {
        let valid = value.len() <= MAX_REF
            && !value.starts_with('-')
            && !value.contains("..")
            && value
                .chars()
                .all(|c| !c.is_whitespace() && !c.is_control() && !"~^:?*[\\".contains(c));
        if !valid {
            return Err("Invalid base branch.".into());
        }
    }

    Ok(input)
}
