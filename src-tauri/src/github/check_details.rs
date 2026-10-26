use serde::{Deserialize, Serialize};

use crate::fs::expand_home;
use crate::github::checks::github_check_state;
use crate::github::cli::gh_checked;
use crate::github::repo::split_github_repo;

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GitHubCheckDetails {
    steps: Vec<GitHubCheckStep>,
    annotations: Vec<GitHubCheckAnnotation>,
    notice: Option<String>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
struct GitHubCheckStep {
    name: String,
    state: String,
    started_at: Option<String>,
    completed_at: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
struct GitHubCheckAnnotation {
    #[serde(default)]
    path: String,
    #[serde(default, rename(deserialize = "start_line"))]
    line: u64,
    #[serde(default)]
    message: String,
    #[serde(default, rename(deserialize = "annotation_level"))]
    level: String,
}

#[tauri::command]
pub async fn git_github_check_details(
    cwd: String,
    repo: String,
    job_id: String,
) -> Result<GitHubCheckDetails, String> {
    tauri::async_runtime::spawn_blocking(move || {
        github_check_details_with(&repo, &job_id, |endpoint| {
            gh_checked(
                &expand_home(&cwd),
                &["api", "--hostname", "github.com", endpoint],
            )
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

fn github_check_details_with(
    repo: &str,
    job_id: &str,
    mut fetch: impl FnMut(&str) -> Result<String, String>,
) -> Result<GitHubCheckDetails, String> {
    let (owner, name) = split_github_repo(repo)?;
    // Only repository slugs and numeric IDs can enter API paths.
    if [&owner, &name].iter().any(|part| {
        matches!(part.as_str(), "." | "..")
            || !part
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || "-_.".contains(c))
    }) || job_id.parse::<u64>().ok().filter(|id| *id > 0).is_none()
        || !job_id.bytes().all(|c| c.is_ascii_digit())
    {
        return Err("Invalid GitHub repository or job ID".into());
    }
    #[derive(Deserialize)]
    struct Step {
        name: String,
        status: String,
        conclusion: Option<String>,
        started_at: Option<String>,
        completed_at: Option<String>,
    }
    #[derive(Deserialize)]
    struct Job {
        id: u64,
        #[serde(default)]
        steps: Vec<Step>,
        check_run_url: Option<String>,
    }
    let prefix = format!("repos/{owner}/{name}");
    let json = fetch(&format!("{prefix}/actions/jobs/{job_id}"))?;
    let job: Job = serde_json::from_str(&json).map_err(|error| error.to_string())?;
    if job.id.to_string() != job_id {
        return Err("GitHub returned a different job".into());
    }
    let mut details = GitHubCheckDetails {
        steps: job
            .steps
            .into_iter()
            .map(|step| GitHubCheckStep {
                name: step.name,
                state: github_check_state(
                    &step.status,
                    step.conclusion.as_deref().unwrap_or_default(),
                ),
                started_at: step.started_at,
                completed_at: step.completed_at,
            })
            .collect(),
        annotations: vec![],
        notice: None,
    };
    let check_prefix = format!("https://api.github.com/{prefix}/check-runs/");
    let check_id = job
        .check_run_url
        .as_deref()
        .and_then(|value| value.strip_prefix(&check_prefix))
        .filter(|value| !value.is_empty() && value.bytes().all(|c| c.is_ascii_digit()));
    if let Some(check_id) = check_id {
        let annotations = fetch(&format!(
            "{prefix}/check-runs/{check_id}/annotations?per_page=100"
        ))
        .and_then(|json| {
            serde_json::from_str::<Vec<GitHubCheckAnnotation>>(&json)
                .map_err(|error| error.to_string())
        });
        match annotations {
            Ok(annotations) => {
                if annotations.len() == 100 {
                    details.notice = Some(
                        "Showing the first 100 annotations. View the full log on GitHub for more."
                            .into(),
                    );
                }
                details.annotations = annotations;
            }
            Err(_) => {
                details.notice =
                    Some("Could not load error annotations. View the full log on GitHub.".into())
            }
        }
    } else {
        details.notice =
            Some("Error annotations are unavailable. View the full log on GitHub.".into());
    }
    Ok(details)
}

#[cfg(test)]
mod tests;
