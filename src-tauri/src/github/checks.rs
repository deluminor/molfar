use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::fs::expand_home;
use crate::github::cli::gh_checked;
use crate::github::repo::split_github_repo;

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPrCheck {
    pub name: String,
    pub workflow: String,
    pub state: String,
    pub url: Option<String>,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPrChecks {
    pub head_oid: String,
    pub checks: Vec<GitHubPrCheck>,
}

/// CI checks for one pull request, targeted explicitly by `repo` and `number` via `gh`.
#[tauri::command]
pub async fn git_github_pr_checks(
    cwd: String,
    repo: String,
    number: i64,
) -> Result<GitHubPrChecks, String> {
    tauri::async_runtime::spawn_blocking(move || {
        git_github_pr_checks_for(&expand_home(&cwd), &repo, number)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn git_github_pr_checks_for(
    root: &Path,
    repo: &str,
    number: i64,
) -> Result<GitHubPrChecks, String> {
    let args = github_pr_checks_args(repo, number)?;
    let refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let json = gh_checked(root, &refs)?;
    parse_github_pr_checks(&json)
}

fn github_pr_checks_args(repo: &str, number: i64) -> Result<Vec<String>, String> {
    if number <= 0 {
        return Err("GitHub pull request number must be positive".into());
    }
    let (owner, name) = split_github_repo(repo)?;
    let repo = format!("{owner}/{name}");
    let number = number.to_string();
    Ok(vec![
        "pr".into(),
        "view".into(),
        number,
        "--repo".into(),
        repo,
        "--json".into(),
        "headRefOid,statusCheckRollup".into(),
    ])
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GitHubStatusCheckRow {
    #[serde(default, rename = "__typename")]
    typename: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    context: String,
    #[serde(default)]
    status: String,
    #[serde(default)]
    conclusion: Option<String>,
    #[serde(default)]
    state: String,
    #[serde(default)]
    workflow_name: String,
    #[serde(default)]
    details_url: Option<String>,
    #[serde(default)]
    target_url: Option<String>,
    #[serde(default)]
    created_at: Option<String>,
    #[serde(default)]
    started_at: Option<String>,
    #[serde(default)]
    completed_at: Option<String>,
}

fn parse_github_pr_checks(json: &str) -> Result<GitHubPrChecks, String> {
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Row {
        #[serde(default)]
        head_ref_oid: String,
        #[serde(default)]
        status_check_rollup: Option<Vec<GitHubStatusCheckRow>>,
    }
    let row: Row = serde_json::from_str(json).map_err(|error| error.to_string())?;
    let head_oid = row.head_ref_oid.trim().to_string();
    if head_oid.is_empty() {
        return Err("Pull request is missing head commit".into());
    }
    Ok(GitHubPrChecks {
        head_oid,
        checks: row
            .status_check_rollup
            .unwrap_or_default()
            .into_iter()
            .map(github_pr_check_from_row)
            .collect(),
    })
}

fn github_pr_check_from_row(row: GitHubStatusCheckRow) -> GitHubPrCheck {
    let is_status_context = if row.typename.is_empty() {
        !row.context.is_empty()
    } else {
        row.typename.eq_ignore_ascii_case("StatusContext")
    };
    if is_status_context {
        return GitHubPrCheck {
            name: row.context,
            workflow: String::new(),
            state: github_check_conclusion_state(&row.state),
            url: row.target_url.filter(|url| !url.trim().is_empty()),
            started_at: row.created_at,
            completed_at: None,
        };
    }
    GitHubPrCheck {
        name: row.name,
        workflow: row.workflow_name,
        state: github_check_state(&row.status, row.conclusion.as_deref().unwrap_or_default()),
        url: row.details_url.filter(|url| !url.trim().is_empty()),
        started_at: row.started_at,
        completed_at: row.completed_at,
    }
}

/// An unfinished CheckRun reports its execution state instead of a stale
/// conclusion. Only a completed or entirely missing status trusts the
/// conclusion; any other nonempty status stays unknown.
pub(super) fn github_check_state(status: &str, conclusion: &str) -> String {
    match status.trim().to_ascii_uppercase().as_str() {
        "QUEUED" | "IN_PROGRESS" | "PENDING" | "WAITING" | "REQUESTED" => {
            return "pending".into();
        }
        "COMPLETED" | "" => return github_check_conclusion_state(conclusion),
        _ => {}
    }
    "unknown".into()
}

fn github_check_conclusion_state(value: &str) -> String {
    match value.trim().to_ascii_uppercase().as_str() {
        "SUCCESS" => "pass".into(),
        "FAILURE" | "ERROR" | "TIMED_OUT" | "ACTION_REQUIRED" | "STARTUP_FAILURE" => "fail".into(),
        "QUEUED" | "IN_PROGRESS" | "PENDING" | "WAITING" | "REQUESTED" => "pending".into(),
        "NEUTRAL" | "SKIPPED" => "skipping".into(),
        "CANCELLED" => "cancel".into(),
        _ => "unknown".into(),
    }
}

#[cfg(test)]
mod tests;
