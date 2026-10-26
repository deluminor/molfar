use std::io::ErrorKind;
use std::path::Path;
use std::process::Command;
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

pub(super) fn gh_stdout(root: &Path, args: &[&str]) -> Option<String> {
    gh_run(root, args, false).ok()
}

pub(super) fn gh_checked(root: &Path, args: &[&str]) -> Result<String, String> {
    gh_run(root, args, false)
}

struct GitHubRateLimitBackoff {
    until: SystemTime,
    error: String,
}

// Shared by all webviews, including background Inbox and PR checks requests.
static GITHUB_RATE_LIMIT_BACKOFF: Mutex<Option<GitHubRateLimitBackoff>> = Mutex::new(None);

pub(super) fn gh_run(root: &Path, args: &[&str], allow_empty: bool) -> Result<String, String> {
    gh_with_backoff(
        &GITHUB_RATE_LIMIT_BACKOFF,
        args,
        allow_empty,
        |args, allow_empty| gh_run_raw(root, args, allow_empty),
    )
}

fn github_rate_limit_error(
    backoff: &mut Option<GitHubRateLimitBackoff>,
    now: SystemTime,
) -> Option<String> {
    if let Some(active) = backoff.as_ref().filter(|active| now < active.until) {
        return Some(active.error.clone());
    }
    *backoff = None;
    None
}

fn gh_with_backoff(
    backoff: &Mutex<Option<GitHubRateLimitBackoff>>,
    args: &[&str],
    allow_empty: bool,
    mut run: impl FnMut(&[&str], bool) -> Result<String, String>,
) -> Result<String, String> {
    if let Ok(mut slot) = backoff.lock() {
        if let Some(error) = github_rate_limit_error(&mut slot, SystemTime::now()) {
            return Err(error);
        }
    }
    let result = run(args, allow_empty);
    let Err(error) = &result else {
        return result;
    };
    let message = error.to_lowercase();
    let primary = message.contains("api rate limit") && message.contains("exceeded");
    let secondary = message.contains("secondary rate limit") || message.contains("abuse detection");
    if !primary && !secondary {
        return result;
    }
    // Stop other requests immediately and resolve the reset once. If GitHub
    // cannot return it, retry after a minute rather than hammering the API.
    if let Ok(mut slot) = backoff.lock() {
        if github_rate_limit_error(&mut slot, SystemTime::now()).is_some() {
            return result;
        }
        *slot = Some(GitHubRateLimitBackoff {
            until: SystemTime::now() + Duration::from_secs(60),
            error: error.clone(),
        });
    } else {
        return result;
    }
    if primary && message.contains("graphql") {
        // The REST /rate_limit endpoint can disagree with the live GraphQL
        // quota. Query the same resource that reported the exhausted budget.
        let reset = run(
            &[
                "api",
                "graphql",
                "-f",
                "query=query { rateLimit { remaining resetAt } }",
            ],
            false,
        )
        .and_then(|json| parse_github_rate_limit_backoff(&json));
        if let Ok(until) = reset {
            if let Ok(mut slot) = backoff.lock() {
                *slot = until
                    .filter(|until| *until > SystemTime::now())
                    .map(|until| GitHubRateLimitBackoff {
                        until,
                        error: error.clone(),
                    });
            }
        }
    }
    result
}

fn parse_github_rate_limit_backoff(json: &str) -> Result<Option<SystemTime>, String> {
    let response: serde_json::Value =
        serde_json::from_str(json).map_err(|error| error.to_string())?;
    let rate = &response["data"]["rateLimit"];
    let remaining = rate["remaining"]
        .as_u64()
        .ok_or("GitHub did not return its remaining quota")?;
    if remaining > 0 {
        return Ok(None);
    }
    let reset = rate["resetAt"]
        .as_str()
        .ok_or("GitHub did not return its rate-limit reset")?;
    let reset = time::OffsetDateTime::parse(reset, &time::format_description::well_known::Rfc3339)
        .map_err(|error| error.to_string())?
        .unix_timestamp();
    let seconds = u64::try_from(reset).map_err(|error| error.to_string())?;
    UNIX_EPOCH
        .checked_add(Duration::from_secs(seconds.saturating_add(1)))
        .map(Some)
        .ok_or_else(|| "Invalid GitHub rate-limit reset".into())
}

fn gh_run_raw(root: &Path, args: &[&str], allow_empty: bool) -> Result<String, String> {
    let program = crate::harness::resolve_gui_binary("gh")
        .ok_or_else(|| "GitHub CLI (`gh`) is not installed.".to_string())?;
    let mut cmd = Command::new(&program);
    cmd.current_dir(root)
        .args(args)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GH_PROMPT_DISABLED", "1")
        .env("GH_PAGER", "cat")
        .env("GIT_PAGER", "cat");
    crate::harness::apply_gui_env(&mut cmd);
    crate::hide_window_console(&mut cmd);
    let output = cmd.output().map_err(|error| {
        if error.kind() == ErrorKind::NotFound {
            "GitHub CLI (`gh`) is not installed.".to_string()
        } else {
            error.to_string()
        }
    })?;
    if output.status.success() {
        let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if text.is_empty() {
            if allow_empty {
                return Ok(String::new());
            }
            return Err("gh returned no output".into());
        }
        return Ok(text);
    }
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let detail = if !stderr.is_empty() {
        stderr
    } else if !stdout.is_empty() {
        stdout
    } else {
        format!("gh {} failed", args.join(" "))
    };
    Err(detail)
}

#[cfg(test)]
mod tests;
