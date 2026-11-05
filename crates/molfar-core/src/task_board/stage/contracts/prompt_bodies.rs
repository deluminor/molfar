use super::constants::{IMPL_REPORT, PR_DESCRIPTION, REVIEW};
use crate::task_board::{stage::agent::AgentStage, types::Card};

fn output(blocks: &[(&str, &str)]) -> String {
    let mut lines = vec![
        "## Output".to_owned(),
        "End your final message with these blocks, exactly as delimited. MOLFAR saves them as files; anything outside".into(),
        "the blocks is ignored. Each block must be complete Markdown on its own.".into(),
        String::new(),
    ];
    for (kind, body) in blocks {
        lines.push(format!("<<<MOLFAR:{kind}>>>\n{body}\n<<<END:{kind}>>>"));
    }
    lines.join("\n")
}

pub(super) fn build(stage: AgentStage, card: &Card, head: &str) -> Vec<String> {
    let report = "# Implementation report\n## Summary\n## Commits (sha — subject)\n## Checks run and results (lint, typecheck, tests)\n## Deviations from the plan\n## Follow-ups";
    match stage {
        AgentStage::Implement => vec![
            "## Goal".into(),
            "Implement the approved plan, stage by stage. Write tests first where practical, keep each stage working, and run".into(),
            "the lint, typecheck and test commands the plan or the repository defines before you finish.".into(),
            output(&[(IMPL_REPORT, report)]),
        ],
        AgentStage::Rework => vec![
            "## Goal".into(),
            "Address exactly the findings selected for rework and the user's note. Leave unselected findings alone unless".into(),
            "fixing a selected one requires it. Re-run the checks before you finish.".into(),
            output(&[(IMPL_REPORT, &format!("{report}\n## Resolution of each selected finding"))]),
        ],
        AgentStage::CodeReview => vec![
            "## Goal".into(),
            format!("Review the change `git diff {}...{head}` against the spec, its acceptance", card.base_sha.as_deref().unwrap_or("<base>")),
            "criteria and the plan. Inspect the diff and any surrounding code yourself. Look for correctness bugs, missing".into(),
            "tests, security issues, broken contracts and deviations from the plan. Anchor every finding to file:line.".into(),
            "Use APPROVE only when nothing blocking or major remains.".into(),
            "Also write the pull request description for this change, grounded in the diff, the spec and the".into(),
            "implementation report: English, no emojis, no filler, no attribution.".into(),
            output(&[
                (REVIEW, "Verdict: APPROVE | CHANGES_REQUESTED\n\n## F1 [blocking|major|minor|nit] <finding title>\nFile: <path>:<line>\n<what is wrong, why it matters, how to fix>"),
                (PR_DESCRIPTION, "### Summary\n<what changes for the user and why, in two or three sentences>\n\n### Scope\n- <grouped bullets of what the diff actually does>\n\n### Notes for reviewers\n- <decisions, deferred scope, risks; omit the section if there is nothing real to say>\n\n### Testing\n- <only checks that were actually run, with results>"),
            ]),
        ],
        AgentStage::Grill => Vec::new(),
    }
}
