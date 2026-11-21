use std::path::{Path, PathBuf};
use std::sync::LazyLock;
use std::time::{SystemTime, UNIX_EPOCH};

use regex::Regex;

use super::cli::{Captured, Cli};
use super::forge::{Forge, UNKNOWN_FORGE};

static REQUEST_NUMBER: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"/(?:pull|-/merge_requests)/(\d+)(?:[/?#]|$)").expect("valid request number regex")
});

pub fn pull_request_number(url: &str) -> Option<i64> {
    REQUEST_NUMBER
        .captures(url)?
        .get(1)?
        .as_str()
        .parse()
        .ok()
        .filter(|number| *number > 0)
}

pub(super) fn create(
    cli: &mut impl Cli,
    forge: Forge,
    title: &str,
    body: &str,
    base: &str,
    head: &str,
) -> Result<String, String> {
    let title = title.trim();
    if title.is_empty() {
        return Err("Pull request title cannot be empty".into());
    }
    if forge == Forge::Unknown {
        return Err(UNKNOWN_FORGE.into());
    }
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    let path = std::env::temp_dir().join(format!("molfar-pr-{stamp}.md"));
    let _remove = Remove(path.clone());
    std::fs::write(&path, body.trim()).map_err(|error| error.to_string())?;
    let (program, args, empty) = argv(forge, title, base.trim(), head.trim(), &path);
    let captured = cli
        .run(program, &args)
        .map_err(|error| fail(forge, error))?;
    if !captured.ok {
        return Err(fail(forge, detail(program, &captured, &args)));
    }
    url_from(&captured.stdout, empty)
}

fn argv<'a>(
    forge: Forge,
    title: &'a str,
    base: &'a str,
    head: &'a str,
    path: &'a Path,
) -> (&'static str, Vec<String>, &'static str) {
    let file = path.to_string_lossy().into_owned();
    if forge == Forge::GitLab {
        return (
            "glab",
            vec![
                "mr".into(),
                "create".into(),
                "--yes".into(),
                "--title".into(),
                title.into(),
                "--description-file".into(),
                file,
                "--source-branch".into(),
                head.into(),
                "--target-branch".into(),
                base.into(),
            ],
            "glab returned no merge request URL",
        );
    }
    (
        "gh",
        vec![
            "pr".into(),
            "create".into(),
            "--title".into(),
            title.into(),
            "--body-file".into(),
            file,
            "--base".into(),
            base.into(),
            "--head".into(),
            head.into(),
        ],
        "gh returned no pull request URL",
    )
}

pub(super) fn command_text(
    program: &str,
    captured: Captured,
    args: &[String],
) -> Result<String, String> {
    if !captured.ok {
        return Err(detail(program, &captured, args));
    }
    let text = captured.stdout.trim().to_owned();
    if text.is_empty() {
        return Err(format!("{program} returned no output"));
    }
    Ok(text)
}

fn detail(program: &str, captured: &Captured, args: &[String]) -> String {
    let stderr = captured.stderr.trim();
    if !stderr.is_empty() {
        return stderr.to_owned();
    }
    let stdout = captured.stdout.trim();
    if !stdout.is_empty() {
        return stdout.to_owned();
    }
    format!("{program} {} failed", args.join(" "))
}

fn url_from(stdout: &str, empty: &str) -> Result<String, String> {
    stdout
        .lines()
        .rev()
        .map(str::trim)
        .find(|line| line.starts_with("http://") || line.starts_with("https://"))
        .map(str::to_owned)
        .ok_or_else(|| {
            if stdout.trim().is_empty() {
                empty.to_owned()
            } else {
                stdout.trim().to_owned()
            }
        })
}

pub(super) fn fail(forge: Forge, detail: String) -> String {
    if forge != Forge::GitLab {
        return detail;
    }
    let lower = detail.to_ascii_lowercase();
    if lower.contains("glab") || detail.contains("GitLab") {
        detail
    } else {
        format!("GitLab CLI (`glab`) failed. {detail}")
    }
}

struct Remove(PathBuf);

impl Drop for Remove {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

#[cfg(test)]
#[path = "pull_request_tests.rs"]
mod tests;
