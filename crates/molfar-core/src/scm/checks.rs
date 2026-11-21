use std::path::Path;

use serde_json::{json, Value};

use super::cli::{Cli, Process};
use super::forge::{Forge, UNKNOWN_FORGE};
use super::pull_request::{command_text, fail, pull_request_number};

pub(super) fn rollup(root: &Path, url: &str) -> Result<String, String> {
    let mut cli = Process { root };
    match url_forge(url) {
        Some(Forge::GitLab) => gitlab_rollup(&mut cli, url),
        Some(Forge::GitHub) => github_rollup(&mut cli, url),
        _ => match super::forge::at(root)? {
            Forge::GitHub => github_rollup(&mut cli, url),
            Forge::GitLab => gitlab_rollup(&mut cli, url),
            Forge::Unknown => Err(UNKNOWN_FORGE.into()),
        },
    }
}

pub(super) fn failed_log(root: &Path, job: &str) -> Result<String, String> {
    let mut cli = Process { root };
    match super::forge::at(root)? {
        Forge::GitLab => trace(&mut cli, job),
        Forge::GitHub => {
            let args = vec![
                "run".into(),
                "view".into(),
                "--job".into(),
                job.into(),
                "--log-failed".into(),
            ];
            command_text("gh", cli.run("gh", &args)?, &args)
        }
        Forge::Unknown => Err(UNKNOWN_FORGE.into()),
    }
}

pub(super) fn github_rollup(cli: &mut impl Cli, url: &str) -> Result<String, String> {
    let args = vec![
        "pr".into(),
        "view".into(),
        url.into(),
        "--json".into(),
        "statusCheckRollup".into(),
    ];
    command_text("gh", cli.run("gh", &args)?, &args)
}

pub(super) fn gitlab_rollup(cli: &mut impl Cli, url: &str) -> Result<String, String> {
    let iid = pull_request_number(url)
        .ok_or_else(|| "Could not read the merge request number.".to_string())?;
    let args = vec![
        "ci".into(),
        "get".into(),
        "--merge-request".into(),
        iid.to_string(),
        "--output".into(),
        "json".into(),
        "--with-job-details".into(),
    ];
    match cli.run("glab", &args) {
        Err(error) => Err(fail(Forge::GitLab, error)),
        Ok(captured) if !captured.ok && no_pipeline(&captured.stdout, &captured.stderr) => {
            Ok(r#"{"statusCheckRollup":[]}"#.into())
        }
        Ok(captured) if !captured.ok => Err(fail(
            Forge::GitLab,
            super::pull_request::command_text("glab", captured, &args).unwrap_err(),
        )),
        Ok(captured) => map_pipeline(captured.stdout.trim()),
    }
}

pub(super) fn trace(cli: &mut impl Cli, job: &str) -> Result<String, String> {
    let args = vec!["ci".into(), "trace".into(), job.into()];
    command_text("glab", cli.run("glab", &args)?, &args).map_err(|error| fail(Forge::GitLab, error))
}

pub(super) fn map_pipeline(json_text: &str) -> Result<String, String> {
    let value: Value = serde_json::from_str(json_text)
        .map_err(|error| format!("Unreadable CI status: {error}"))?;
    let jobs = value
        .get("jobs")
        .and_then(Value::as_array)
        .filter(|jobs| !jobs.is_empty());
    let checks: Vec<Value> = match jobs {
        Some(jobs) => jobs.iter().map(job_check).collect(),
        None => vec![check(
            "pipeline",
            value.get("status").and_then(Value::as_str).unwrap_or(""),
            value.get("web_url").and_then(Value::as_str),
        )],
    };
    serde_json::to_string(&json!({ "statusCheckRollup": checks }))
        .map_err(|error| error.to_string())
}

fn job_check(job: &Value) -> Value {
    check(
        job.get("name").and_then(Value::as_str).unwrap_or("job"),
        job.get("status").and_then(Value::as_str).unwrap_or(""),
        job.get("web_url").and_then(Value::as_str),
    )
}

fn check(name: &str, status: &str, url: Option<&str>) -> Value {
    let (run_status, conclusion) = match status.to_ascii_lowercase().as_str() {
        "success" => ("COMPLETED", "SUCCESS"),
        "skipped" => ("COMPLETED", "SKIPPED"),
        "failed" | "canceled" | "cancelled" => ("COMPLETED", "FAILURE"),
        _ => ("IN_PROGRESS", ""),
    };
    let mut check = json!({
        "name": name,
        "__typename": "CheckRun",
        "status": run_status,
        "conclusion": conclusion,
    });
    if let Some(url) = url {
        check["detailsUrl"] = json!(url);
    }
    check
}

fn url_forge(url: &str) -> Option<Forge> {
    if pull_request_number(url).is_none() {
        return None;
    }
    if url.contains("/-/merge_requests/") {
        Some(Forge::GitLab)
    } else if url.contains("/pull/") {
        Some(Forge::GitHub)
    } else {
        None
    }
}

fn no_pipeline(stdout: &str, stderr: &str) -> bool {
    format!("{stdout}\n{stderr}")
        .to_ascii_lowercase()
        .contains("no pipeline")
}

#[cfg(test)]
#[path = "checks_tests.rs"]
mod tests;
