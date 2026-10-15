use super::types::{CardCreate, CardPatch, COLUMNS, RUN_STATES};
use crate::session_store::validate_id;

const MAX_TITLE: usize = 200;
const MAX_DESCRIPTION: usize = 100_000;
const MAX_CRITERIA: usize = 50_000;
const MAX_PATH: usize = 4_096;
const MAX_REF: usize = 255;
const MAX_JSON: usize = 20_000;
const MAX_ERROR: usize = 20_000;

pub(crate) fn one_of(value: &str, allowed: &[&str], label: &str) -> Result<(), String> {
    if allowed.contains(&value) {
        return Ok(());
    }
    Err(format!("Invalid {label}."))
}

fn text(value: &str, max: usize, label: &str) -> Result<(), String> {
    if value.trim().is_empty() || value.len() > max {
        return Err(format!(
            "{label} is required and must be under {max} characters."
        ));
    }
    Ok(())
}

/// Refs reach `git` as arguments; a leading dash would be parsed as an option.
pub(crate) fn git_ref(value: &str, label: &str) -> Result<(), String> {
    let valid = !value.is_empty()
        && value.len() <= MAX_REF
        && !value.starts_with('-')
        && !value.contains("..")
        && value
            .chars()
            .all(|c| !c.is_whitespace() && !c.is_control() && !"~^:?*[\\".contains(c));
    if valid {
        return Ok(());
    }
    Err(format!("Invalid {label}."))
}

fn path(value: &str, label: &str) -> Result<(), String> {
    if value.trim().is_empty() || value.len() > MAX_PATH || value.contains('\0') {
        return Err(format!("Invalid {label}."));
    }
    Ok(())
}

fn json_object(value: &str, label: &str) -> Result<(), String> {
    let parsed: serde_json::Value =
        serde_json::from_str(value).map_err(|_| format!("Invalid {label}."))?;
    if value.len() > MAX_JSON || !parsed.is_object() {
        return Err(format!("Invalid {label}."));
    }
    Ok(())
}

pub(crate) fn create(input: &CardCreate) -> Result<(), String> {
    validate_id(&input.id, "card")?;
    path(&input.project_cwd, "project")?;
    text(&input.title, MAX_TITLE, "Title")?;
    text(&input.description, MAX_DESCRIPTION, "Description")?;
    if input.acceptance_criteria.len() > MAX_CRITERIA {
        return Err("Acceptance criteria are too long.".into());
    }
    if let Some(base) = &input.base_ref {
        git_ref(base, "base branch")?;
    }
    Ok(())
}

pub(crate) fn patch(input: &CardPatch) -> Result<(), String> {
    if let Some(title) = &input.title {
        text(title, MAX_TITLE, "Title")?;
    }
    if let Some(description) = &input.description {
        text(description, MAX_DESCRIPTION, "Description")?;
    }
    if input
        .acceptance_criteria
        .as_ref()
        .is_some_and(|value| value.len() > MAX_CRITERIA)
    {
        return Err("Acceptance criteria are too long.".into());
    }
    if let Some(column) = &input.column_id {
        one_of(column, &COLUMNS, "column")?;
    }
    if let Some(state) = &input.run_state {
        one_of(state, &RUN_STATES, "run state")?;
    }
    if input.position.is_some_and(|value| !value.is_finite()) {
        return Err("Invalid position.".into());
    }
    if let Some(Some(base)) = &input.base_ref {
        git_ref(base, "base branch")?;
    }
    if let Some(Some(sha)) = &input.base_sha {
        git_ref(sha, "base commit")?;
    }
    if let Some(Some(branch)) = &input.branch {
        git_ref(branch, "branch")?;
    }
    if let Some(Some(worktree)) = &input.worktree_path {
        path(worktree, "worktree")?;
    }
    if input.grill_round.is_some_and(|value| value < 0)
        || input.rework_cycle.is_some_and(|value| value < 0)
    {
        return Err("Invalid counter.".into());
    }
    if let Some(overrides) = &input.overrides_json {
        json_object(overrides, "stage overrides")?;
    }
    if let Some(Some(delivery)) = &input.delivery_json {
        json_object(delivery, "delivery")?;
    }
    if let Some(Some(error)) = &input.last_error {
        if error.len() > MAX_ERROR {
            return Err("Error text is too long.".into());
        }
    }
    Ok(())
}
