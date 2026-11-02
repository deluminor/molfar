use super::types::{Answer, Question};
use regex::Regex;
use std::{collections::HashMap, sync::OnceLock};

pub(super) fn parse(markdown: &str) -> Result<Vec<Question>, String> {
    static RECOMMENDED: OnceLock<Regex> = OnceLock::new();
    let heading = super::super::contracts::output::question_heading();
    let recommended = RECOMMENDED.get_or_init(|| {
        Regex::new(r"(?i)^\*\*Recommended:?\*\*:?\s*").expect("fixed recommendation prefix")
    });
    let normalized = markdown.replace("\r\n", "\n").replace('\r', "\n");
    let mut result: Vec<Question> = Vec::new();
    let mut in_recommendation = false;

    for line in normalized.lines() {
        if let Some(captures) = heading.captures(line.trim()) {
            result.push(Question {
                number: captures[1]
                    .parse()
                    .map_err(|_| "Invalid question number.")?,
                title: captures[2].trim().into(),
                body: String::new(),
                recommended: String::new(),
            });
            in_recommendation = false;
            continue;
        }
        let Some(question) = result.last_mut() else {
            continue;
        };
        let text = line.trim();
        if !in_recommendation && recommended.is_match(text) {
            in_recommendation = true;
            question
                .recommended
                .push_str(&recommended.replace(text, ""));
        } else {
            let target = if in_recommendation {
                &mut question.recommended
            } else {
                &mut question.body
            };
            target.push('\n');
            target.push_str(line);
        }
    }

    for question in &mut result {
        question.body = question.body.trim().into();
        question.recommended = question.recommended.trim().into();
    }
    if !markdown.trim().is_empty() && result.is_empty() {
        return Err("questions: Questions must use `## Q<n> — <title>` headings.".into());
    }

    Ok(result)
}

pub(super) fn format(questions: &[Question], answers: &[Answer], note: &str) -> String {
    let by_number: HashMap<_, _> = answers
        .iter()
        .map(|a| (a.number, a.answer.trim()))
        .collect();
    let mut sections: Vec<_> = questions
        .iter()
        .map(|question| {
            let answer = by_number
                .get(&question.number)
                .copied()
                .filter(|a| !a.is_empty())
                .unwrap_or_else(|| {
                    if question.recommended.is_empty() {
                        "(no answer)"
                    } else {
                        &question.recommended
                    }
                });
            format!(
                "## Q{} — {}\n\n**Answer:** {answer}",
                question.number, question.title
            )
        })
        .collect();

    if !note.trim().is_empty() {
        sections.push(format!("## Note\n\n{}", note.trim()));
    }

    sections.join("\n\n")
}
