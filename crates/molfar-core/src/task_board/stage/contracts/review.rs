use super::types::{CodeReview, FindingSeverity, ReviewFinding, ReviewVerdict};
use regex::Regex;
use std::sync::OnceLock;

pub fn parse(markdown: &str) -> Result<CodeReview, String> {
    static VERDICT: OnceLock<Regex> = OnceLock::new();
    static FINDING: OnceLock<Regex> = OnceLock::new();
    static FILE: OnceLock<Regex> = OnceLock::new();
    let verdict = VERDICT.get_or_init(|| {
        Regex::new(r"(?i)^Verdict:\s*(APPROVE|CHANGES_REQUESTED)\s*$")
            .expect("fixed review verdict")
    });
    let heading = FINDING.get_or_init(|| {
        Regex::new(r"(?i)^##\s+(F[0-9]+)\s*\[(blocking|major|minor|nit)\]\s*(.+)$")
            .expect("fixed review heading")
    });
    let file =
        FILE.get_or_init(|| Regex::new(r"(?i)^File:\s*(.+)$").expect("fixed review location"));
    let text = markdown.replace("\r\n", "\n").replace('\r', "\n");
    let first = text
        .lines()
        .find(|line| !line.trim().is_empty())
        .unwrap_or("");
    let captures = verdict
        .captures(first.trim())
        .ok_or("Review must start with `Verdict: APPROVE | CHANGES_REQUESTED`.")?;
    let verdict = if captures[1].eq_ignore_ascii_case("APPROVE") {
        ReviewVerdict::Approve
    } else {
        ReviewVerdict::ChangesRequested
    };
    let mut findings: Vec<ReviewFinding> = Vec::new();
    for line in text.lines() {
        if let Some(captures) = heading.captures(line.trim()) {
            let severity = match captures[2].to_ascii_lowercase().as_str() {
                "blocking" => FindingSeverity::Blocking,
                "major" => FindingSeverity::Major,
                "minor" => FindingSeverity::Minor,
                _ => FindingSeverity::Nit,
            };
            findings.push(ReviewFinding {
                id: captures[1].to_ascii_uppercase(),
                severity,
                title: captures[3].trim().into(),
                file: None,
                body: String::new(),
            });
            continue;
        }
        let Some(current) = findings.last_mut() else {
            continue;
        };
        if let Some(captures) = file
            .captures(line.trim())
            .filter(|_| current.file.is_none() && current.body.is_empty())
        {
            current.file = Some(captures[1].trim().into());
        } else {
            current.body.push('\n');
            current.body.push_str(line);
        }
    }
    for finding in &mut findings {
        finding.body = finding.body.trim().into();
    }
    Ok(CodeReview { verdict, findings })
}

pub fn rework_brief(
    findings: &[ReviewFinding],
    selected: &[String],
    note: &str,
) -> Result<String, String> {
    let mut blocks = Vec::new();
    for finding in findings
        .iter()
        .filter(|finding| selected.contains(&finding.id))
    {
        let file = finding
            .file
            .as_ref()
            .map(|file| format!("\nFile: {file}"))
            .unwrap_or_default();
        blocks.push(format!(
            "## {} [{}] {}{file}\n\n{}",
            finding.id,
            finding.severity.id(),
            finding.title,
            finding.body
        ));
    }
    if !note.trim().is_empty() {
        blocks.push(format!("## Note\n\n{}", note.trim()));
    }
    let body = blocks.join("\n\n");
    if body.trim().is_empty() {
        return Err("Select at least one finding or add a note.".into());
    }
    Ok(body)
}
