use std::path::Path;

use super::cli;
use serde_json::Value;

pub(super) const NO_REMOTE: &str = "No git remote to open a merge request or pull request against.";
pub(super) const UNKNOWN_FORGE: &str = "Could not tell whether this remote is GitHub or GitLab. Install and authenticate gh or glab for this host.";
pub(super) const GH_AUTH: &[&str] = &["auth", "status", "--json", "hosts"];
pub(super) const GLAB_AUTH: &[&str] = &["auth", "status", "--all"];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Forge {
    GitHub,
    GitLab,
    Unknown,
}

impl Forge {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::GitHub => "github",
            Self::GitLab => "gitlab",
            Self::Unknown => "unknown",
        }
    }

    pub fn parse(text: &str) -> Self {
        match text.trim() {
            "github" => Self::GitHub,
            "gitlab" => Self::GitLab,
            _ => Self::Unknown,
        }
    }
}

pub(super) fn at(cwd: &Path) -> Result<Forge, String> {
    if crate::files::remote::is_remote(cwd) {
        return Err("Forge detection is local only".into());
    }
    let root = super::expand_home(cwd);
    let upstream = super::git_stdout(&root, &["rev-parse", "--abbrev-ref", "@{upstream}"]);
    let listing = super::git_stdout(&root, &["remote", "-v"]).unwrap_or_default();
    if let Some(forge) = labeled(&upstream, &listing)? {
        return Ok(forge);
    }
    let github = parse_gh_hosts(&cli::auth_hosts(&root, "gh", GH_AUTH, false));
    let gitlab = parse_glab_hosts(&cli::auth_hosts(&root, "glab", GLAB_AUTH, true));
    decide(upstream.as_deref(), &listing, &github, &gitlab)
}

/// SaaS and `gitlab.*` need no auth list. A custom host returns `None` so the
/// caller can read both CLIs. `gitlab.*` stays GitLab without starting `gh`.
fn labeled(upstream: &Option<String>, listing: &str) -> Result<Option<Forge>, String> {
    let host = preferred_host(upstream.as_deref(), listing)?;
    let Some(host) = host else {
        return Ok(Some(Forge::Unknown));
    };
    Ok(match host.as_str() {
        "github.com" | "www.github.com" => Some(Forge::GitHub),
        "gitlab.com" | "www.gitlab.com" => Some(Forge::GitLab),
        host if host == "gitlab" || host.starts_with("gitlab.") => Some(Forge::GitLab),
        _ => None,
    })
}

fn preferred_host(upstream: Option<&str>, listing: &str) -> Result<Option<String>, String> {
    let remotes = parse_remotes(listing);
    let names: Vec<String> = remotes.iter().map(|(name, _)| name.clone()).collect();
    let preferred = preferred_remote(upstream, &names).ok_or_else(|| NO_REMOTE.to_string())?;
    let url = remotes
        .iter()
        .find(|(name, _)| name == &preferred)
        .map(|(_, url)| url.as_str())
        .unwrap_or("");
    Ok(remote_host(url))
}

pub(super) fn decide(
    upstream: Option<&str>,
    listing: &str,
    github_hosts: &[String],
    gitlab_hosts: &[String],
) -> Result<Forge, String> {
    let Some(host) = preferred_host(upstream, listing)? else {
        return Ok(Forge::Unknown);
    };
    Ok(classify(&host, github_hosts, gitlab_hosts))
}

pub(super) fn preferred_remote(upstream: Option<&str>, remote_names: &[String]) -> Option<String> {
    if let Some(remote) = upstream
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .and_then(|value| value.split_once('/'))
        .map(|(remote, _)| remote.trim())
        .filter(|remote| !remote.is_empty())
    {
        return Some(remote.to_string());
    }
    if remote_names.iter().any(|name| name == "origin") {
        return Some("origin".to_string());
    }
    remote_names
        .first()
        .filter(|name| !name.is_empty())
        .cloned()
}

pub(super) fn remote_host(url: &str) -> Option<String> {
    let remote = url.trim().trim_end_matches('/');
    let remote = remote.strip_suffix(".git").unwrap_or(remote);
    let host = if let Some(rest) = remote
        .strip_prefix("https://")
        .or_else(|| remote.strip_prefix("http://"))
        .or_else(|| remote.strip_prefix("ssh://"))
    {
        let (authority, _) = rest.split_once('/')?;
        authority.rsplit('@').next()?.split(':').next()?.to_string()
    } else {
        let (user_host, _) = remote.split_once(':')?;
        if user_host.contains('/') {
            return None;
        }
        user_host.rsplit('@').next()?.to_string()
    };
    let host = host.trim().trim_end_matches('.').to_ascii_lowercase();
    (!host.is_empty()).then_some(host)
}

pub(super) fn classify(host: &str, github_hosts: &[String], gitlab_hosts: &[String]) -> Forge {
    let host = host.trim().trim_end_matches('.').to_ascii_lowercase();
    if host == "github.com" || host == "www.github.com" {
        return Forge::GitHub;
    }
    if host == "gitlab.com" || host == "www.gitlab.com" {
        return Forge::GitLab;
    }
    let on_github = listed(github_hosts, &host);
    let on_gitlab = listed(gitlab_hosts, &host);
    if on_github && on_gitlab {
        return Forge::Unknown;
    }
    if on_github {
        return Forge::GitHub;
    }
    if on_gitlab || host == "gitlab" || host.starts_with("gitlab.") {
        return Forge::GitLab;
    }
    Forge::Unknown
}

fn listed(hosts: &[String], host: &str) -> bool {
    hosts
        .iter()
        .any(|item| item.trim().trim_end_matches('.').eq_ignore_ascii_case(host))
}

pub(super) fn parse_gh_hosts(json: &str) -> Vec<String> {
    let Ok(value) = serde_json::from_str::<Value>(json.trim()) else {
        return Vec::new();
    };
    let hosts = value.get("hosts").unwrap_or(&value);
    let names = match hosts {
        Value::Object(map) => map.keys().cloned().collect(),
        Value::Array(items) => items
            .iter()
            .filter_map(|item| {
                item.as_str()
                    .map(str::to_owned)
                    .or_else(|| item.get("host")?.as_str().map(str::to_owned))
            })
            .collect(),
        _ => Vec::new(),
    };
    names
        .into_iter()
        .map(|name| name.trim().to_ascii_lowercase())
        .filter(|name| !name.is_empty())
        .collect()
}

pub(super) fn parse_glab_hosts(text: &str) -> Vec<String> {
    let mut hosts = Vec::new();
    for line in text.lines() {
        if line.starts_with([' ', '\t']) {
            continue;
        }
        let name = line.trim();
        if name.is_empty() || name.contains(char::is_whitespace) {
            continue;
        }
        let name = name.trim_end_matches('.').to_ascii_lowercase();
        if name.contains('.') || name == "gitlab" {
            hosts.push(name);
        }
    }
    hosts
}

pub(super) fn parse_remotes(text: &str) -> Vec<(String, String)> {
    let mut remotes = Vec::new();
    for line in text.lines() {
        let line = line.trim();
        let Some((name, rest)) = line.split_once(['\t', ' ']) else {
            continue;
        };
        let name = name.trim();
        if name.is_empty() || remotes.iter().any(|(seen, _)| seen == name) {
            continue;
        }
        let rest = rest.trim();
        let url = rest
            .strip_suffix(" (fetch)")
            .or_else(|| rest.strip_suffix(" (push)"))
            .unwrap_or(rest)
            .trim();
        if !url.is_empty() {
            remotes.push((name.to_string(), url.to_string()));
        }
    }
    remotes
}

#[cfg(test)]
#[path = "forge_tests.rs"]
mod tests;
