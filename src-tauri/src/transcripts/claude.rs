use std::collections::{HashMap, HashSet};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

use tauri::AppHandle;

use crate::dirs_home;

/// Recover Bash commands that older UI builds saved as a bare "Shell" row.
/// Claude's own transcript retains the complete tool input by tool-use id.
#[tauri::command(async)]
pub fn claude_shell_commands(
    app: AppHandle,
    provider_session_id: String,
    provider_account_id: Option<String>,
    tool_ids: Vec<String>,
) -> Result<HashMap<String, String>, String> {
    if provider_session_id.is_empty()
        || !provider_session_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
    {
        return Err("Invalid Claude provider session id".into());
    }
    if tool_ids.is_empty() {
        return Ok(HashMap::new());
    }
    let config_dir = match provider_account_id.as_deref() {
        Some(id) if id != "default" => crate::harness::provider_account_path(&app, "claude", id)?,
        _ => match std::env::var_os("CLAUDE_CONFIG_DIR") {
            Some(path) => PathBuf::from(path),
            None => {
                PathBuf::from(dirs_home().ok_or("Home directory is unavailable")?).join(".claude")
            }
        },
    };
    let transcript_name = format!("{provider_session_id}.jsonl");
    let root = config_dir.join("projects");
    let Some(path) = std::fs::read_dir(root).ok().and_then(|projects| {
        projects.flatten().find_map(|project| {
            let candidate = project.path().join(&transcript_name);
            candidate.is_file().then_some(candidate)
        })
    }) else {
        return Ok(HashMap::new());
    };
    claude_shell_commands_from_file(&path, &tool_ids)
}

fn claude_shell_commands_from_file(
    path: &Path,
    tool_ids: &[String],
) -> Result<HashMap<String, String>, String> {
    let wanted: HashSet<&str> = tool_ids.iter().map(String::as_str).collect();
    let file = std::fs::File::open(path).map_err(|error| error.to_string())?;
    let mut commands = HashMap::new();
    for line in BufReader::new(file).lines() {
        let line = line.map_err(|error| error.to_string())?;
        let Ok(record) = serde_json::from_str::<serde_json::Value>(&line) else {
            continue;
        };
        if record.get("type").and_then(serde_json::Value::as_str) != Some("assistant") {
            continue;
        }
        let Some(content) = record
            .pointer("/message/content")
            .and_then(serde_json::Value::as_array)
        else {
            continue;
        };
        for block in content {
            let Some(id) = block.get("id").and_then(serde_json::Value::as_str) else {
                continue;
            };
            if wanted.contains(id)
                && block.get("name").and_then(serde_json::Value::as_str) == Some("Bash")
            {
                if let Some(command) = block
                    .pointer("/input/command")
                    .and_then(serde_json::Value::as_str)
                    .filter(|command| !command.trim().is_empty())
                {
                    commands.insert(id.to_owned(), command.to_owned());
                }
            }
        }
        if commands.len() == wanted.len() {
            break;
        }
    }
    Ok(commands)
}

#[cfg(test)]
mod tests;
