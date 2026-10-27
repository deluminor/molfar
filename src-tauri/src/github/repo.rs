use std::path::Path;

use serde::Deserialize;

use crate::fs::expand_home;
use crate::git::command::git_stdout;
use crate::git::remote::git_remote_name;
use crate::github::cli::{gh_checked, gh_stdout};

/// `owner/repo` for the GitHub remote of this working copy, via `gh`.
#[tauri::command]
pub async fn git_github_repo(cwd: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || git_github_repo_for(&expand_home(&cwd)))
        .await
        .map_err(|e| e.to_string())?
}

/// The GitHub remote of this working copy and, when it is a fork, its parent.
#[tauri::command]
pub async fn git_github_repositories(cwd: String) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || git_github_repositories_for(&expand_home(&cwd)))
        .await
        .map_err(|e| e.to_string())?
}

pub(super) fn git_github_repo_for(root: &Path) -> Result<String, String> {
    let json = gh_checked(root, &["repo", "view", "--json", "nameWithOwner"])?;
    #[derive(Deserialize)]
    struct View {
        #[serde(rename = "nameWithOwner")]
        name_with_owner: String,
    }
    let view: View = serde_json::from_str(&json).map_err(|error| error.to_string())?;
    let slug = view.name_with_owner.trim();
    if slug.is_empty() || !slug.contains('/') {
        return Err("GitHub did not return a repository".into());
    }
    Ok(slug.to_string())
}

fn git_github_repositories_for(root: &Path) -> Result<Vec<String>, String> {
    let json = gh_checked(root, &["repo", "view", "--json", "nameWithOwner,parent"])?;
    parse_github_repositories(&json)
}

fn parse_github_repositories(json: &str) -> Result<Vec<String>, String> {
    #[derive(Deserialize)]
    struct Owner {
        login: String,
    }
    #[derive(Deserialize)]
    struct Parent {
        name: String,
        owner: Owner,
    }
    #[derive(Deserialize)]
    struct View {
        #[serde(rename = "nameWithOwner")]
        name_with_owner: String,
        #[serde(default)]
        parent: Option<Parent>,
    }

    let view: View = serde_json::from_str(json).map_err(|error| error.to_string())?;
    let (owner, name) = split_github_repo(&view.name_with_owner)?;
    let mut repos = vec![format!("{owner}/{name}")];
    if let Some(parent) = view.parent {
        let parent = format!("{}/{}", parent.owner.login, parent.name);
        let (owner, name) = split_github_repo(&parent)?;
        let parent = format!("{owner}/{name}");
        if !repos[0].eq_ignore_ascii_case(&parent) {
            repos.push(parent);
        }
    }
    Ok(repos)
}

pub(super) fn split_github_repo(slug: &str) -> Result<(String, String), String> {
    let slug = slug.trim();
    let Some((owner, name)) = slug.split_once('/') else {
        return Err("GitHub did not return a repository".into());
    };
    let owner = owner.trim();
    let name = name.trim();
    if owner.is_empty()
        || name.is_empty()
        || name.contains('/')
        || owner.chars().any(char::is_whitespace)
        || name.chars().any(char::is_whitespace)
    {
        return Err("GitHub did not return a repository".into());
    }
    Ok((owner.to_string(), name.to_string()))
}

pub(crate) fn github_fetch_remote(root: &Path) -> Option<String> {
    if let Some(name) = gh_resolved_remote(root) {
        return Some(name);
    }
    if let Some(url) = gh_repo_view_url(root) {
        if let Some(name) = remote_matching_github_url(root, &url) {
            return Some(name);
        }
    }
    git_remote_name(root)
}

fn gh_resolved_remote(root: &Path) -> Option<String> {
    let listed = git_stdout(
        root,
        &["config", "--get-regexp", r"remote\..*\.gh-resolved"],
    )?;
    for line in listed.lines() {
        let key = line.split_whitespace().next()?;
        let name = key.strip_prefix("remote.")?.strip_suffix(".gh-resolved")?;
        if !name.is_empty() {
            return Some(name.to_string());
        }
    }
    None
}

fn gh_repo_view_url(root: &Path) -> Option<String> {
    let text = gh_stdout(root, &["repo", "view", "--json", "url"])?;
    serde_json::from_str::<serde_json::Value>(&text)
        .ok()?
        .get("url")?
        .as_str()
        .map(str::to_owned)
        .filter(|url| !url.trim().is_empty())
}

fn remote_matching_github_url(root: &Path, url: &str) -> Option<String> {
    let remotes = git_stdout(root, &["remote", "-v"])?;
    let wanted = normalize_github_remote_url(url);
    for line in remotes.lines() {
        let mut parts = line.split_whitespace();
        let name = parts.next()?;
        let remote_url = parts.next()?;
        if normalize_github_remote_url(remote_url) == wanted {
            return Some(name.to_string());
        }
    }
    None
}

fn normalize_github_remote_url(url: &str) -> String {
    let trimmed = url.trim().trim_end_matches('/').trim_end_matches(".git");
    if let Some((_, rest)) = trimmed.split_once("github.com:") {
        return format!(
            "github.com/{}",
            rest.trim_start_matches('/').to_ascii_lowercase()
        );
    }
    if let Some((_, rest)) = trimmed.split_once("github.com/") {
        return format!(
            "github.com/{}",
            rest.trim_start_matches('/').to_ascii_lowercase()
        );
    }
    trimmed.to_ascii_lowercase()
}

#[cfg(test)]
mod tests;
