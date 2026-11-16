use std::path::Path;

use serde::Serialize;

use crate::fs::expand_home;
use crate::git::command::{git_run, git_stdout};
use crate::git::info::git_is_work_tree;
use crate::git::remote::{git_default_branch, git_ref_exists, git_remote_name};

const GIT_HISTORY_DEFAULT: u32 = 200;
const GIT_HISTORY_MAX: u32 = 500;

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitHistoryRef {
    pub name: String,
    pub kind: String,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitHistoryCommit {
    pub sha: String,
    pub short_sha: String,
    pub parents: Vec<String>,
    pub author: String,
    pub timestamp: i64,
    pub subject: String,
    pub refs: Vec<GitHistoryRef>,
    pub head: bool,
}

#[derive(Serialize, Clone, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitHistory {
    pub head: Option<String>,
    pub commits: Vec<GitHistoryCommit>,
}

/// Recent commits for the Graph view: HEAD, upstream, and the default
/// branch. Newest first, with parent SHAs for the graph.
#[tauri::command]
pub async fn git_history(cwd: String, limit: Option<u32>) -> Result<GitHistory, String> {
    crate::background_work::read(move || git_history_for(&expand_home(&cwd), limit))
        .await
        .map_err(|e| e.to_string())?
}

/// Tips for the Graph filter: current HEAD, its upstream, and
/// the repo default branch. Omits `refs/stash` and unmerged local branches.
fn git_history_tips(root: &Path) -> Vec<String> {
    let mut tips = vec!["HEAD".to_string()];
    if git_stdout(root, &["rev-parse", "--abbrev-ref", "@{upstream}"]).is_some() {
        tips.push("@{upstream}".to_string());
    }
    if let Some(remote) = git_remote_name(root) {
        if let Some(branch) = git_default_branch(root, Some(remote.as_str())) {
            let spec = format!("{remote}/{branch}");
            if git_ref_exists(root, &format!("refs/remotes/{spec}")) {
                tips.push(spec);
            }
        }
    }
    tips
}

pub(super) fn git_history_for(root: &Path, limit: Option<u32>) -> Result<GitHistory, String> {
    if !git_is_work_tree(root) {
        return Ok(GitHistory::default());
    }
    let n = limit
        .unwrap_or(GIT_HISTORY_DEFAULT)
        .clamp(1, GIT_HISTORY_MAX);
    let count = n.to_string();
    let head = git_stdout(root, &["rev-parse", "HEAD"]);
    let remotes = git_remote_names(root);
    let tips = git_history_tips(root);
    let mut args = vec![
        "log".to_string(),
        "--topo-order".to_string(),
        "--decorate=short".to_string(),
        "--max-count".to_string(),
        count,
        "--format=%H%x00%h%x00%P%x00%an%x00%at%x00%D%x00%s%x1e".to_string(),
    ];
    args.extend(tips);
    let args_ref: Vec<&str> = args.iter().map(String::as_str).collect();
    let Some(text) = git_run(root, &args_ref) else {
        return Ok(GitHistory {
            head,
            commits: Vec::new(),
        });
    };
    Ok(GitHistory {
        commits: parse_git_history_log(&text, head.as_deref(), &remotes),
        head,
    })
}

fn parse_git_history_log(
    text: &str,
    head: Option<&str>,
    remotes: &[String],
) -> Vec<GitHistoryCommit> {
    let mut commits = Vec::new();
    for record in text.split('\u{1e}') {
        let record = record.trim();
        if record.is_empty() {
            continue;
        }
        let mut fields = record.split('\0');
        let Some(sha) = fields.next() else { continue };
        let Some(short_sha) = fields.next() else {
            continue;
        };
        let Some(parents) = fields.next() else {
            continue;
        };
        let Some(author) = fields.next() else {
            continue;
        };
        let Some(timestamp) = fields.next() else {
            continue;
        };
        let Some(decorations) = fields.next() else {
            continue;
        };
        let subject = fields.next().unwrap_or("");
        if sha.is_empty() {
            continue;
        }
        let (is_head, refs) = parse_git_decorations(decorations, head, sha, remotes);
        commits.push(GitHistoryCommit {
            sha: sha.to_string(),
            short_sha: if short_sha.is_empty() {
                sha.chars().take(7).collect()
            } else {
                short_sha.to_string()
            },
            parents: parents.split_whitespace().map(str::to_string).collect(),
            author: author.to_string(),
            timestamp: timestamp.parse().unwrap_or(0),
            subject: subject.to_string(),
            refs,
            head: is_head,
        });
    }
    commits
}

fn parse_git_decorations(
    raw: &str,
    head: Option<&str>,
    sha: &str,
    remotes: &[String],
) -> (bool, Vec<GitHistoryRef>) {
    let mut is_head = head == Some(sha);
    let mut refs = Vec::new();
    for part in raw.split(',') {
        let part = part.trim();
        if part.is_empty() {
            continue;
        }
        if let Some(name) = part.strip_prefix("HEAD -> ") {
            is_head = true;
            if !name.is_empty() {
                refs.push(GitHistoryRef {
                    name: name.to_string(),
                    kind: "local".into(),
                });
            }
        } else if part == "HEAD" {
            is_head = true;
        } else if let Some(tag) = part.strip_prefix("tag: ") {
            if !tag.is_empty() {
                refs.push(GitHistoryRef {
                    name: tag.to_string(),
                    kind: "tag".into(),
                });
            }
        } else if part.ends_with("/HEAD") {
            continue;
        } else if remotes
            .iter()
            .any(|remote| part == remote || part.starts_with(&format!("{remote}/")))
        {
            refs.push(GitHistoryRef {
                name: part.to_string(),
                kind: "remote".into(),
            });
        } else {
            refs.push(GitHistoryRef {
                name: part.to_string(),
                kind: "local".into(),
            });
        }
    }
    (is_head, refs)
}

pub(super) fn git_remote_names(root: &Path) -> Vec<String> {
    git_run(root, &["remote"])
        .unwrap_or_default()
        .lines()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(str::to_string)
        .collect()
}

pub(super) fn git_peel_commit(root: &Path, spec: &str) -> Result<String, String> {
    let spec = spec.trim();
    if spec.len() < 4 || spec.len() > 40 || !spec.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("Invalid commit".into());
    }
    let peeled = format!("{spec}^{{commit}}");
    git_stdout(root, &["rev-parse", "--verify", &peeled]).ok_or_else(|| "Unknown commit".into())
}

#[cfg(test)]
mod tests;
