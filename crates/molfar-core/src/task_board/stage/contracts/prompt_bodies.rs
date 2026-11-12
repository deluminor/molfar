use super::constants::{IMPL_REPORT, PR_DESCRIPTION, REVIEW};
use super::types::PromptExtras;
use crate::task_board::{stage::agent::AgentStage, types::Card};

const REPORT: &str = "# Implementation report\nStatus: complete | partial | blocked\n## Summary\n## Acceptance criteria (each one: done | not done — evidence)\n## Commits (sha — subject)\n## Checks run and results (lint, typecheck, tests)\n## Deviations from the plan\n## Remaining work (only when partial or blocked: exact stages and criteria left)";

const STATUS: &str = "## Status\nStart the report with exactly one status line. MOLFAR reads it to decide what happens next:\n- `Status: complete`: every plan stage and acceptance criterion is implemented, committed and the checks pass.\n- `Status: partial`: work remains. MOLFAR starts a fresh session that continues from your report and commits,\n  so list precisely what remains.\n- `Status: blocked`: you cannot continue without the user. Explain the blocker in the Summary.";

const REVIEW_TEMPLATE: &str = "Verdict: APPROVE | CHANGES_REQUESTED\n\n## Acceptance criteria\n- <criterion>: met | not met — <evidence: file, test or check>\n\n## F1 [blocking|major|minor|nit] <finding title>\nFile: <path>:<line>\n<what is wrong, why it matters, how to fix>";

const PR_TEMPLATE: &str = "### Summary\n<what changes for the user and why, in two or three sentences>\n\n### Scope\n- <grouped bullets of what the diff actually does>\n\n### Notes for reviewers\n- <decisions, deferred scope, risks; omit the section if there is nothing real to say>\n\n### Testing\n- <only checks that were actually run, with results>";

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

fn continuation(card: &Card, run: i64) -> Option<String> {
    (run > 0).then(|| {
        format!(
            "## Continuation\nThis is continuation run {run} of this stage: an earlier run stopped partway. Read the latest\nimplementation report in the handoff files and `git log {}..HEAD`, check what is already done, then finish the\nremaining work. Do not redo or revert finished work unless it is wrong.",
            card.base_sha.as_deref().unwrap_or("<base>")
        )
    })
}

fn writing(goal: &[&str], card: &Card, run: i64, report: &str) -> Vec<String> {
    let mut sections = vec![format!("## Goal\n{}", goal.join("\n"))];
    sections.extend(continuation(card, run));
    sections.push(STATUS.into());
    sections.push(output(&[(IMPL_REPORT, report)]));
    sections
}

fn checks(summary: &Option<String>) -> Option<String> {
    summary.as_ref().map(|summary| {
        format!("## Checks\nMOLFAR ran the project's verify command before this review: {summary}\nA failing check is a blocking finding. Passing checks need no re-run.")
    })
}

pub(super) fn build(
    stage: AgentStage,
    card: &Card,
    head: &str,
    extras: &PromptExtras,
) -> Vec<String> {
    let run = extras.continuation;
    match stage {
        AgentStage::Implement => writing(
            &[
                "Implement the whole approved plan in this session: every execution stage and every acceptance criterion in",
                "the spec. The card is done only when a reviewer can verify each criterion in the code and its tests. Do not",
                "stop after a foundation or a first slice, and do not hand planned stages back as follow-ups.",
                "Work stage by stage: write tests first where practical, keep every stage building and passing, and commit",
                "each stage once it works. Before you finish, run the lint, typecheck and test commands the plan or the",
                "repository defines and fix what fails. Stop early only when you are genuinely blocked or your session is",
                "about to run out; then commit what works and report exactly what remains.",
            ],
            card,
            run,
            REPORT,
        ),
        AgentStage::Rework => writing(
            &[
                "Resolve every finding selected for rework, and the user's note, completely. A finding is resolved only when",
                "the code no longer has the problem; when it says planned scope is missing, implement that scope. Leave",
                "unselected findings alone unless fixing a selected one requires it. Add or update tests for every fix and",
                "re-run the lint, typecheck and test commands before you finish.",
            ],
            card,
            run,
            &format!("{REPORT}\n## Resolution of each selected finding (resolved | not resolved — evidence)"),
        ),
        AgentStage::CodeReview => {
            let base = card.base_sha.as_deref().unwrap_or("<base>");
            let goal = [
                &format!("Review the change `git diff {base}...{head}` against the spec, its acceptance criteria and the plan."),
                "Read the whole diff and the surrounding code before you write anything, and report every finding in this",
                "one pass: a rework fixes all of them at once, so never stop at the first blocking issue. Check each acceptance",
                "criterion explicitly; an unmet criterion is a blocking finding. Look for correctness bugs, missing or weak",
                "tests, unhandled errors, security issues, broken contracts, performance problems and deviations from the plan.",
                "Run the repository's lint, typecheck and test commands when they do not modify tracked files, and report the",
                "results. Anchor every finding to file:line.",
                "Severity: blocking = a criterion is unmet or the change is broken; major = a real defect or risk to fix before",
                "merge; minor = worth fixing, not dangerous; nit = style. When blocking or major findings remain, MOLFAR sends",
                "them back to rework automatically together with the minor ones. Use APPROVE only when every criterion is met",
                "and nothing blocking or major remains.",
                "Also write the pull request description for this change, grounded in the diff, the spec and the",
                "implementation report: English, no emojis, no filler, no attribution.",
            ]
            .join("\n");
            let mut sections = vec![format!("## Goal\n{goal}")];
            sections.extend(checks(&extras.checks));
            sections.push(output(&[(REVIEW, REVIEW_TEMPLATE), (PR_DESCRIPTION, PR_TEMPLATE)]));
            sections
        }
        AgentStage::Grill => Vec::new(),
    }
}
