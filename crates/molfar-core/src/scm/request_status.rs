use std::path::Path;

use serde::Deserialize;
use serde_json::{json, Value};

use super::cli::{Cli, Process};
use super::forge::{Forge, UNKNOWN_FORGE};
use super::pull_request::{command_text, fail};
use super::Pr;

pub(super) fn github_status(
    cli: &mut impl Cli,
    branch: &str,
    owner: &str,
) -> Result<Option<Pr>, String> {
    let args = vec![
        "pr".into(),
        "list".into(),
        "--head".into(),
        branch.into(),
        "--json".into(),
        "number,title,url,state,headRepositoryOwner".into(),
        "--limit".into(),
        "20".into(),
        "--state".into(),
        "all".into(),
    ];
    let text = command_text("gh", cli.run("gh", &args)?, &args)?;
    Ok(parse_gh_list(&text, owner))
}

pub(super) fn gitlab_status(cli: &mut impl Cli, branch: &str) -> Result<Option<Pr>, String> {
    let args = vec![
        "mr".into(),
        "list".into(),
        "--source-branch".into(),
        branch.into(),
        "--all".into(),
        "--output".into(),
        "json".into(),
        "--per-page".into(),
        "20".into(),
    ];
    let text = command_text("glab", cli.run("glab", &args)?, &args)?;
    Ok(parse_glab_list(&text))
}

pub(super) fn parse_glab_list(json: &str) -> Option<Pr> {
    let rows: Vec<Value> = serde_json::from_str(json).ok()?;
    let mut best = None;
    for row in rows {
        let number = row.get("iid")?.as_i64()?;
        if number <= 0 {
            continue;
        }
        let pr = Pr {
            number,
            title: row.get("title")?.as_str()?.to_owned(),
            url: row.get("web_url")?.as_str()?.to_owned(),
            state: glab_state(row.get("state")?.as_str()?),
        };
        if pr.state == "open" {
            return Some(pr);
        }
        if best.is_none() {
            best = Some(pr);
        }
    }
    best
}

fn glab_state(state: &str) -> String {
    match state.to_ascii_lowercase().as_str() {
        "opened" | "open" => "open".into(),
        "merged" => "merged".into(),
        "closed" | "locked" => "closed".into(),
        other => other.to_owned(),
    }
}

pub(super) fn parse_gh_list(json: &str, owner: &str) -> Option<Pr> {
    #[derive(Deserialize)]
    struct Owner {
        login: String,
    }
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Row {
        number: i64,
        title: String,
        url: String,
        state: String,
        head_repository_owner: Option<Owner>,
    }
    let rows: Vec<Row> = serde_json::from_str(json).ok()?;
    let mut best = None;
    for row in rows.into_iter().filter(|row| {
        row.head_repository_owner
            .as_ref()
            .is_none_or(|head| head.login.eq_ignore_ascii_case(owner))
    }) {
        let pr = Pr {
            number: row.number,
            title: row.title,
            url: row.url,
            state: row.state.to_lowercase(),
        };
        if pr.state == "open" {
            return Some(pr);
        }
        if best.is_none() {
            best = Some(pr);
        }
    }
    best
}

pub(super) fn view(cwd: &Path, repo: Option<&str>, number: u64) -> Result<Value, String> {
    let mut cli = Process { root: cwd };
    match super::forge::at(cwd)? {
        Forge::GitLab => glab_view(&mut cli, repo, number),
        Forge::GitHub => gh_view(&mut cli, repo, number),
        Forge::Unknown => Err(UNKNOWN_FORGE.into()),
    }
}

pub(super) fn glab_view(
    cli: &mut impl Cli,
    repo: Option<&str>,
    number: u64,
) -> Result<Value, String> {
    let mut args = vec![
        "mr".into(),
        "view".into(),
        number.to_string(),
        "--output".into(),
        "json".into(),
    ];
    if let Some(repo) = repo {
        args.push("--repo".into());
        args.push(repo.into());
    }
    let text = command_text("glab", cli.run("glab", &args)?, &args)
        .map_err(|error| fail(Forge::GitLab, error))?;
    map_glab_view(&text)
}

fn gh_view(cli: &mut impl Cli, repo: Option<&str>, number: u64) -> Result<Value, String> {
    let mut args = vec![
        "pr".into(),
        "view".into(),
        number.to_string(),
        "--json".into(),
        "title,state,url,isDraft,additions,deletions".into(),
    ];
    if let Some(repo) = repo {
        args.push("--repo".into());
        args.push(repo.into());
    }
    let text = command_text("gh", cli.run("gh", &args)?, &args)?;
    serde_json::from_str(&text).map_err(|error| error.to_string())
}

pub(super) fn map_glab_view(text: &str) -> Result<Value, String> {
    let value: Value = serde_json::from_str(text).map_err(|error| error.to_string())?;
    let mut state = value
        .get("state")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_ascii_lowercase();
    if state == "opened" {
        state = "open".into();
    }
    Ok(json!({
        "title": value.get("title").and_then(Value::as_str).unwrap_or(""),
        "state": state,
        "url": value.get("web_url").and_then(Value::as_str).unwrap_or(""),
        "isDraft": value.get("draft").and_then(Value::as_bool).unwrap_or(false),
        "additions": value.get("additions").and_then(Value::as_i64).unwrap_or(0),
        "deletions": value.get("deletions").and_then(Value::as_i64).unwrap_or(0),
    }))
}
