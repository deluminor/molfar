//! Per-project verify commands in the Board settings JSON (`verifyCommands`).
use super::settings::VERIFY_COMMANDS;
use crate::task_board::{constants::MAX_PATH, stage::verify::constants::MAX_COMMAND};
use serde_json::{json, Map, Value};

pub(super) fn validate(settings: &Map<String, Value>) -> Result<(), String> {
    let Some(value) = settings.get(VERIFY_COMMANDS) else {
        return Ok(());
    };
    let entries = value
        .as_object()
        .ok_or("Verify commands must be an object.")?;

    for (project, command) in entries {
        let command = command.as_str().unwrap_or_default();
        if project.is_empty() || project.len() > MAX_PATH {
            return Err("Invalid verify command project.".into());
        }
        if command.trim().is_empty() || command.len() > MAX_COMMAND {
            return Err("Verify command must be 1–2000 characters.".into());
        }
    }
    Ok(())
}

/// Saves a trimmed command for the project; an empty one removes it.
pub(super) fn set(
    settings: &mut Map<String, Value>,
    project: &str,
    command: Option<&str>,
) -> Result<(), String> {
    let entries = settings.entry(VERIFY_COMMANDS).or_insert_with(|| json!({}));
    let entries = entries
        .as_object_mut()
        .ok_or("Board settings are unreadable.")?;

    match command.map(str::trim).filter(|command| !command.is_empty()) {
        Some(command) => entries.insert(project.to_owned(), json!(command)),
        None => entries.remove(project),
    };
    Ok(())
}

/// The project's verify command, if the user set one; unreadable settings mean none.
pub fn verify_command(raw: Option<&str>, project: &str) -> Option<String> {
    let settings: Value = serde_json::from_str(raw?).ok()?;
    let command = settings
        .get(VERIFY_COMMANDS)?
        .get(project)?
        .as_str()?
        .trim();
    (!command.is_empty()).then(|| command.to_owned())
}
