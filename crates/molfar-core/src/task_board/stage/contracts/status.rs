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
