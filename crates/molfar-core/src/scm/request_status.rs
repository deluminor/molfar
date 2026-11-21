use serde::Deserialize;
use serde_json::Value;

use super::cli::Cli;
use super::pull_request::command_text;
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
