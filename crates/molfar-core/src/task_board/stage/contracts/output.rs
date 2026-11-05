use super::{
    constants::{QUESTIONS, REVIEW},
    types::ParsedArtifact,
};
use regex::Regex;
use std::sync::OnceLock;

fn body<'a>(text: &'a str, kind: &str) -> Option<&'a str> {
    let open = format!("<<<MOLFAR:{kind}>>>");
    let close = format!("<<<END:{kind}>>>");
    let end = text.rfind(&close)?;
    let start = text[..end].rfind(&open)? + open.len();
    let value = text[start..end].trim_matches(|c: char| c.is_whitespace() || c == '\u{feff}');
    (!value.is_empty()).then_some(value)
}

pub(crate) fn question_heading() -> &'static Regex {
    static QUESTION: OnceLock<Regex> = OnceLock::new();
    QUESTION.get_or_init(|| {
        Regex::new(r"^##\s+Q([0-9]+)\s*(?:[—–:-]\s*)?(.*)$").expect("fixed question heading")
    })
}

pub(super) fn read(
    stage: crate::task_board::stage::agent::AgentStage,
    text: &str,
) -> Result<Vec<ParsedArtifact>, String> {
    let text = text.replace("\r\n", "\n").replace('\r', "\n");
    let contract = super::output_contract(stage);
    let missing: Vec<_> = contract
        .required
        .iter()
        .copied()
        .filter(|kind| body(&text, kind).is_none())
        .collect();
    if !missing.is_empty() {
        return Err(format!("The stage did not return: {}.", missing.join(", ")));
    }

    let mut artifacts = Vec::new();
    for kind in contract.required.iter().chain(contract.optional).copied() {
        let Some(value) = body(&text, kind) else {
            continue;
        };
        if kind == QUESTIONS {
            let heading = question_heading();
            if !value.lines().any(|line| heading.is_match(line.trim())) {
                return Err("questions: Questions must use `## Q<n> — <title>` headings.".into());
            }
        }
        if kind == REVIEW {
            super::review::parse(value).map_err(|error| format!("review: {error}"))?;
        }
        artifacts.push(ParsedArtifact {
            kind: kind.into(),
            body: value.into(),
        });
    }
    Ok(artifacts)
}
