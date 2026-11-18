use regex::Regex;
use std::sync::OnceLock;

/// How far an Implement or Rework run got, as the agent reports it in `impl_report`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ImplStatus {
    Complete,
    Partial,
    Blocked,
}

/// The first `Status:` line naming exactly one value. The template line itself
/// (`complete | partial | blocked`) never counts, so an unfilled report cannot pass as done.
pub fn parse(report: &str) -> Result<ImplStatus, String> {
    static STATUS: OnceLock<Regex> = OnceLock::new();
    let status = STATUS.get_or_init(|| {
        Regex::new(r"(?im)^\s*\**Status:?\**\s*:?\s*\**\s*(complete|partial|blocked)\b(.*)$")
            .expect("fixed implementation status")
    });

    let value = status
        .captures_iter(report)
        .find(|captures| !captures[2].contains('|'))
        .map(|captures| captures[1].to_ascii_lowercase())
        .ok_or("Report must start with one status line: `Status: complete`, `Status: partial` or `Status: blocked`.")?;
    Ok(match value.as_str() {
        "complete" => ImplStatus::Complete,
        "partial" => ImplStatus::Partial,
        _ => ImplStatus::Blocked,
    })
}

/// Manual checks only the owner can run (live external smoke, credentials, paid accounts,
/// devices), listed under `## Owner verification`. They never change the status.
pub fn owner_checks(report: &str) -> Vec<String> {
    static HEADING: OnceLock<Regex> = OnceLock::new();
    static ITEM: OnceLock<Regex> = OnceLock::new();
    let heading = HEADING.get_or_init(|| {
        Regex::new(r"(?i)^#{1,6}\s*owner verification\b").expect("fixed owner heading")
    });
    let item = ITEM.get_or_init(|| {
        Regex::new(r"^(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?").expect("fixed list marker")
    });

    report
        .lines()
        .map(str::trim)
        .skip_while(|line| !heading.is_match(line))
        .skip(1)
        .take_while(|line| !line.starts_with('#'))
        .map(|line| item.replace(line, "").trim().to_owned())
        .filter(|line| !line.is_empty() && !is_none(line))
        .collect()
}

fn is_none(line: &str) -> bool {
    matches!(
        line.trim_end_matches('.').to_ascii_lowercase().as_str(),
        "none" | "n/a" | "na" | "-"
    )
}
