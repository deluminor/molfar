use std::path::Path;
use std::process::Command;

use serde::Serialize;

use crate::github::cli::gh_run;

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitHubStatus {
    pub connected: bool,
    pub installed: bool,
    pub authenticated: bool,
}

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum GitHubStarStatus {
    Starred,
    NotStarred,
    Unavailable,
}

const MOLFAR_STAR_ENDPOINT: &str = "/user/starred/deluminor/molfar";

/// Whether the GitHub CLI is installed and has an active authenticated account.
#[tauri::command]
pub async fn git_github_status() -> Result<GitHubStatus, String> {
    tauri::async_runtime::spawn_blocking(git_github_status_for)
        .await
        .map_err(|error| error.to_string())
}

fn git_github_status_for() -> GitHubStatus {
    let Some(program) = crate::harness::resolve_gui_binary("gh") else {
        return GitHubStatus {
            connected: false,
            installed: false,
            authenticated: false,
        };
    };
    let mut cmd = Command::new(program);
    cmd.args(["auth", "status", "--active", "--hostname", "github.com"])
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GH_PROMPT_DISABLED", "1")
        .env("GH_PAGER", "cat")
        .env("GIT_PAGER", "cat");
    crate::harness::apply_gui_env(&mut cmd);
    crate::hide_window_console(&mut cmd);
    let authenticated = cmd
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false);
    GitHubStatus {
        connected: authenticated,
        installed: true,
        authenticated,
    }
}

/// Whether the active GitHub CLI account has starred the MOLFAR repository.
#[tauri::command]
pub async fn github_molfar_star_status() -> Result<GitHubStarStatus, String> {
    tauri::async_runtime::spawn_blocking(github_molfar_star_status_for)
        .await
        .map_err(|error| error.to_string())
}

fn github_molfar_star_status_for() -> GitHubStarStatus {
    let result = gh_run(
        Path::new("."),
        &["api", "--silent", MOLFAR_STAR_ENDPOINT],
        true,
    );
    github_star_status_from_result(result)
}

fn github_star_status_from_result(result: Result<String, String>) -> GitHubStarStatus {
    match result {
        Ok(_) => GitHubStarStatus::Starred,
        Err(error) if error.contains("HTTP 404") => GitHubStarStatus::NotStarred,
        Err(_) => GitHubStarStatus::Unavailable,
    }
}

/// Star the MOLFAR repository for the active GitHub CLI account.
#[tauri::command]
pub async fn github_star_molfar() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(|| {
        gh_run(
            Path::new("."),
            &["api", "--silent", "--method", "PUT", MOLFAR_STAR_ENDPOINT],
            true,
        )
        .map(|_| ())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests;
