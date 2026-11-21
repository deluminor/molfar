use super::{issue::Comment, issue_key, Issue, Row};
use crate::atlassian::Error;

const ISSUE_CAP: usize = 8_000;
const COMMENT_CAP: usize = 8_000;
const COMMENT_ROWS: usize = 30;
const INDEX_ROWS: usize = 40;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Target {
    Issue { host: String, key: String },
    Project { host: String, key: String },
    Jql { host: String, jql: String },
}

pub fn host_of(site: &str) -> String {
    super::cache::host(site)
}

pub fn format_issue(site: &str, key: &str) -> Result<String, Error> {
    format_url(&format!(
        "molfar://jira/{}/{}",
        host_of(site),
        issue_key(key)?
    ))
}

pub fn format_project(site: &str, key: &str) -> Result<String, Error> {
    format_url(&format!(
        "molfar://jira/{}/project/{}",
        host_of(site),
        issue_key(key)?
    ))
}

pub fn format_jql(site: &str, jql: &str) -> Result<String, Error> {
    super::check_jql_length(jql)?;
    format_url(&format!(
        "molfar://jira/{}/jql?q={}",
        host_of(site),
        urlencoding(jql)
    ))
}

pub fn parse(url: &str) -> Result<Target, Error> {
    let rest = url
        .trim()
        .strip_prefix("molfar://jira/")
        .ok_or_else(|| Error::Invalid("Not a MOLFAR Jira link".into()))?;
    let (host, path) = rest
        .split_once('/')
        .ok_or_else(|| Error::Invalid("Not a MOLFAR Jira link".into()))?;
    if host.is_empty() || host.contains('@') || host.contains(':') {
        return Err(Error::Invalid("Not a MOLFAR Jira link".into()));
    }
    let host = host.to_ascii_lowercase();
    if let Some(query) = path.strip_prefix("jql?q=") {
        return Ok(Target::Jql {
            host,
            jql: urldecoding(query),
        });
    }
    if let Some(key) = path.strip_prefix("project/") {
        return Ok(Target::Project {
            host,
            key: issue_key(key)?.to_owned(),
        });
    }
    Ok(Target::Issue {
        host,
        key: issue_key(path)?.to_owned(),
    })
}

pub fn issue_markdown(issue: &Issue, comments: bool, link: &str) -> String {
    let mut body = format!(
        "{key} {summary}\nStatus: {status}\n\n{description}",
        key = issue.key,
        summary = issue.summary,
        status = issue.status,
        description = issue.description
    );
    body.truncate(ISSUE_CAP);
    if comments {
        let mut text = String::new();
        let mut shown = 0;
        let ordered = newest(&issue.comments);
        for comment in ordered.iter().take(COMMENT_ROWS) {
            let next = format!(
                "\n\n{} — {}\n{}",
                comment.author, comment.created, comment.body
            );
            if text.len() + next.len() > COMMENT_CAP {
                break;
            }
            text.push_str(&next);
            shown += 1;
        }
        if shown < issue.comments.len() {
            text.push_str("\n\ntruncated");
        }
        body.push_str(&text);
    }
    body.push_str(&format!("\n\n{link}"));
    body
}

pub fn epic_index(title: &str, children: &[Row], link: &str) -> String {
    index(title, children, link)
}

pub fn list_index(title: &str, rows: &[Row], link: &str) -> String {
    index(title, rows, link)
}

fn index(title: &str, rows: &[Row], link: &str) -> String {
    let mut lines = vec![title.to_string()];
    for row in rows.iter().take(INDEX_ROWS) {
        lines.push(format!(
            "{} {} {} {}",
            row.key, row.type_name, row.status, row.summary
        ));
    }
    if rows.len() > INDEX_ROWS {
        lines.push("truncated".into());
    }
    lines.push(link.into());
    lines.join("\n")
}

fn newest(comments: &[Comment]) -> Vec<&Comment> {
    let mut comments: Vec<_> = comments.iter().collect();
    comments.sort_by(|left, right| right.created.cmp(&left.created));
    comments
}

fn format_url(url: &str) -> Result<String, Error> {
    if url.chars().count() > 2000 {
        Err(Error::Invalid(
            "The MOLFAR link is longer than 2000 characters".into(),
        ))
    } else {
        Ok(url.to_string())
    }
}

fn urlencoding(value: &str) -> String {
    let mut out = String::new();
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(byte as char)
            }
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

fn urldecoding(value: &str) -> String {
    let mut out = Vec::new();
    let bytes = value.as_bytes();
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            let hex = &value[index + 1..index + 3];
            if let Ok(byte) = u8::from_str_radix(hex, 16) {
                out.push(byte);
                index += 3;
                continue;
            }
        }
        out.push(bytes[index]);
        index += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}
