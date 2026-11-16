//! Reads a pull request's GitHub check rollup and decides what the board does next.
pub mod constants;
#[cfg(test)]
mod tests;
pub mod types;

use constants::{GRACE_MS, LOG_LINES};
use serde::Deserialize;
use types::{Check, CheckState, CiState};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct View {
    #[serde(default)]
    status_check_rollup: Vec<Entry>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Entry {
    #[serde(rename = "__typename", default)]
    kind: String,
    name: Option<String>,
    context: Option<String>,
    status: Option<String>,
    conclusion: Option<String>,
    state: Option<String>,
    details_url: Option<String>,
    target_url: Option<String>,
}

fn status_context(state: &str) -> CheckState {
    match state {
        "SUCCESS" => CheckState::Passed,
        "FAILURE" | "ERROR" => CheckState::Failed,
        _ => CheckState::Pending,
    }
}

fn check_run(status: Option<&str>, conclusion: Option<&str>) -> CheckState {
    if status != Some("COMPLETED") {
        return CheckState::Pending;
    }
    match conclusion.unwrap_or_default() {
        "SUCCESS" | "SKIPPED" | "NEUTRAL" => CheckState::Passed,
        _ => CheckState::Failed,
    }
}

/// `gh pr view --json statusCheckRollup` output as checks: GitHub Actions runs and
/// commit statuses from other CI services.
pub fn parse(json: &str) -> Result<Vec<Check>, String> {
    let view: View =
        serde_json::from_str(json).map_err(|e| format!("Unreadable CI status: {e}"))?;

    Ok(view
        .status_check_rollup
        .into_iter()
        .map(|entry| {
            let state = match (entry.kind.as_str(), entry.state.as_deref()) {
                ("StatusContext", state) | (_, state @ Some(_)) => {
                    status_context(state.unwrap_or_default())
                }
                _ => check_run(entry.status.as_deref(), entry.conclusion.as_deref()),
            };
            Check {
                name: entry
                    .name
                    .or(entry.context)
                    .unwrap_or_else(|| "check".into()),
                state,
                link: entry.details_url.or(entry.target_url),
            }
        })
        .collect())
}

/// A failed check is final; an empty rollup counts as passing only after GitHub had time
/// to register the workflows for the pushed commit.
pub fn evaluate(checks: Vec<Check>, waited_ms: i64) -> CiState {
    if checks.is_empty() {
        return if waited_ms < GRACE_MS {
            CiState::Pending
        } else {
            CiState::Passed
        };
    }

    let pending = checks
        .iter()
        .any(|check| check.state == CheckState::Pending);
    let failed: Vec<Check> = checks
        .into_iter()
        .filter(|check| check.state == CheckState::Failed)
        .collect();
    if !failed.is_empty() {
        return CiState::Failed(failed);
    }
    if pending {
        return CiState::Pending;
    }
    CiState::Passed
}

/// The GitHub Actions job id in a check link, for `gh run view --job <id> --log-failed`.
pub fn job_id(link: &str) -> Option<&str> {
    let id = link.split("/job/").nth(1)?.split(['/', '?', '#']).next()?;
    (!id.is_empty() && id.bytes().all(|byte| byte.is_ascii_digit())).then_some(id)
}

/// The rework brief for a red pull request: failed checks, then each available log tail.
pub fn brief(url: &str, failed: &[Check], logs: &[(String, String)]) -> String {
    let checks: Vec<String> = failed
        .iter()
        .map(|check| match &check.link {
            Some(link) => format!("- {} ({link})", check.name),
            None => format!("- {}", check.name),
        })
        .collect();
    let mut sections = vec![
        "## CI failed".to_owned(),
        format!(
            "Pull request: {url}\n\nFailed checks:\n{}",
            checks.join("\n")
        ),
    ];

    for (name, log) in logs {
        let lines: Vec<&str> = log.trim_end().lines().collect();
        let tail = lines[lines.len().saturating_sub(LOG_LINES)..].join("\n");
        sections.push(format!("### Log: {name}\n\n```text\n{tail}\n```"));
    }
    sections.push("Fix the cause so CI passes. Do not skip, disable or weaken checks.".into());
    sections.join("\n\n")
}
