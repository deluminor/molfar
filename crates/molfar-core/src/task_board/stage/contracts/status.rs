use regex::Regex;
use std::sync::OnceLock;

/// How far an Implement or Rework run got, as the agent reports it in `impl_report`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ImplStatus {
    Complete,
    Partial,
    Blocked,
}

pub fn parse(report: &str) -> Result<ImplStatus, String> {
    static STATUS: OnceLock<Regex> = OnceLock::new();
    let status = STATUS.get_or_init(|| {
        Regex::new(r"(?im)^\s*\**Status:?\**\s*:?\s*\**\s*(complete|partial|blocked)\b")
            .expect("fixed implementation status")
    });

    let captures = status
        .captures(report)
        .ok_or("Report must include `Status: complete | partial | blocked`.")?;
    Ok(match captures[1].to_ascii_lowercase().as_str() {
        "complete" => ImplStatus::Complete,
        "partial" => ImplStatus::Partial,
        _ => ImplStatus::Blocked,
    })
}
