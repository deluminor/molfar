use super::{
    constants::{MAX_BODY, MAX_TITLE},
    types::PullRequestDocs,
};
use crate::task_board::stage::contracts::types::{CodeReview, ReviewVerdict};
use regex::Regex;
use std::sync::LazyLock;

static FRONTMATTER: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^---\n((?s:.*?))\n---").expect("valid frontmatter regex"));
static PR_TITLE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?m)^pr_title:\s*["']?(.+?)["']?\s*$"#).expect("valid pr_title regex")
});
static HEADING: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^(#{1,4})(\s)").expect("valid heading regex"));
static TOP_TITLE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^#\s").expect("valid title regex"));
static PR_NUMBER: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"/pull/(\d+)(?:[/?#]|$)").expect("valid pull number regex"));

fn utf16_len(text: &str) -> usize {
    text.encode_utf16().count()
}

fn truncate_utf16(text: &str, max: usize) -> String {
    let mut units = 0;
    text.chars()
        .take_while(|c| {
            units += c.len_utf16();
            units <= max
        })
        .collect()
}

/// The conventional-commit title Grill proposes in the spec frontmatter, if any.
pub fn spec_pr_title(spec: &str) -> Option<String> {
    let normalized = spec.replace("\r\n", "\n").replace('\r', "\n");
    let header = FRONTMATTER.captures(normalized.trim_start())?;
    let title = PR_TITLE.captures(&header[1])?[1].trim().to_owned();
    if title.is_empty() || utf16_len(&title) > MAX_TITLE {
        return None;
    }
    Some(title)
}

pub fn pull_request_title(card_title: &str, spec: Option<&str>) -> String {
    spec.and_then(spec_pr_title)
        .unwrap_or_else(|| card_title.to_owned())
}

fn nested(markdown: &str) -> String {
    let lines: Vec<&str> = markdown.trim().split('\n').collect();
    let body = match lines.first() {
        Some(first) if TOP_TITLE.is_match(first) => &lines[1..],
        _ => &lines[..],
    };

    body.iter()
        .map(|line| {
            HEADING
                .replace(line, |caps: &regex::Captures<'_>| {
                    format!("{}{}", "#".repeat((caps[1].len() + 2).min(6)), &caps[2])
                })
                .into_owned()
        })
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_owned()
}

fn review_line(review: &CodeReview) -> String {
    let verdict = match review.verdict {
        ReviewVerdict::Approve => "approved",
        ReviewVerdict::ChangesRequested => "changes requested",
    };
    let count = review.findings.len();
    let plural = if count == 1 { "" } else { "s" };
    format!("Code review: **{verdict}**, {count} finding{plural}.")
}

/// Built only from the card's own artifacts: no attribution and no names.
pub fn pull_request_body(number: i64, description: &str, docs: PullRequestDocs<'_>) -> String {
    let notes: Vec<String> = docs
        .review
        .map(review_line)
        .into_iter()
        .chain([format!("Task Board card #{number}.")])
        .collect();
    let footer = format!("---\n\n{}", notes.join(" "));

    if let Some(description) = docs.pr_description.map(str::trim).filter(|d| !d.is_empty()) {
        return truncate_utf16(&format!("{description}\n\n{footer}"), MAX_BODY);
    }

    let mut sections = vec![format!("### Summary\n\n{}", description.trim())];
    if let Some(report) = docs.impl_report.filter(|report| !report.is_empty()) {
        sections.push(format!("### Implementation\n\n{}", nested(report)));
    }
    sections.push(footer);
    truncate_utf16(&sections.join("\n\n"), MAX_BODY)
}

pub fn pull_request_number(url: &str) -> Option<i64> {
    PR_NUMBER
        .captures(url)?
        .get(1)?
        .as_str()
        .parse()
        .ok()
        .filter(|number| *number > 0)
}

/// `gh pr create --base` needs a branch name, while native cards store full refs.
pub fn base_branch(base_ref: &str, remotes: &[String]) -> String {
    let base = base_ref.trim();
    if let Some(branch) = base.strip_prefix("refs/heads/") {
        return branch.to_owned();
    }
    if let Some(rest) = base.strip_prefix("refs/remotes/") {
        return rest
            .split_once('/')
            .map_or(rest, |(_, branch)| branch)
            .to_owned();
    }
    remotes
        .iter()
        .find_map(|remote| base.strip_prefix(&format!("{remote}/")))
        .unwrap_or(base)
        .to_owned()
}
