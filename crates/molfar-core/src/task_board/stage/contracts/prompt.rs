use super::types::{ManifestReference, PromptExtras};
use crate::task_board::stage::agent::AgentStage;
use crate::task_board::types::Card;

/// What to read first. Later runs of a card start from the newest handoff instead of
/// re-reading everything, which is where most repeat tokens go.
fn reading(stage: AgentStage, extras: &PromptExtras) -> &'static str {
    match stage {
        AgentStage::Implement if extras.continuation > 0 => "Start with the latest implementation report: it says what is done and what remains. Open the spec and plan for\nthe remaining stages; skip what is already finished.",
        AgentStage::Rework => "Start with the rework brief: it lists exactly what to fix. Open the spec, plan, review and report only where a\nfix needs them.",
        AgentStage::CodeReview if extras.reviewed_head.is_some() => "Start with the previous review and the latest implementation report. Open the spec and plan to check the\nacceptance criteria.",
        _ => "Read every file below before you start; together they are the card's current state.",
    }
}

fn inputs(files: &[ManifestReference], reading: &str) -> Result<String, String> {
    let mut rows = Vec::new();
    for file in files {
        let title = match file.kind.as_str() {
            "task" => "The task as the user wrote it, with acceptance criteria",
            "spec" => "Spec: problem, acceptance criteria, scope, constraints, risks",
            "plan" => "The implementation plan",
            "questions" => "Questions the previous grill round asked",
            "answers" => "The user's answers and notes",
            "impl_report" => "The latest implementation report",
            "review" => "The latest code review and its findings",
            "rework_brief" => {
                "What this rework must fix: selected findings, failing checks or the user's note"
            }
            "delivery" => "Delivery record",
            "pr_description" => "Pull request description",
            _ => return Err("Unknown handoff artifact kind.".into()),
        };
        if file.version <= 0 || file.path.contains(['\n', '\r', '`', '|']) {
            return Err("Invalid handoff manifest reference.".into());
        }
        rows.push(format!(
            "| `{}` | {} | v{} | {title} |",
            file.path, file.kind, file.version
        ));
    }
    Ok([
        "## Handoff files".to_owned(),
        reading.into(),
        "MOLFAR copied these files from the card into your checkout. They are git-ignored, not part of the repository:".into(),
        "never edit, stage or commit them.".into(),
        String::new(),
        "| File | Kind | Version | What it is |".into(),
        "| --- | --- | --- | --- |".into(),
        rows.join("\n"),
    ].join("\n"))
}

pub(super) fn build(
    stage: crate::task_board::stage::agent::AgentStage,
    card: &Card,
    files: &[ManifestReference],
    skills: &[String],
    head: &str,
    extras: &super::types::PromptExtras,
) -> Result<String, String> {
    if stage == crate::task_board::stage::agent::AgentStage::Grill && card.grill_round < 1 {
        return Err("Grill round must be positive.".into());
    }
    let role = stage.label();
    let header = format!(
        "You are the {role} stage of MOLFAR Task Board card #{}: \"{}\".\nThis is a fresh session. Everything you know about the task is in this prompt, the handoff files it lists and\nthe repository.\n\n- Project: {}\n- Working checkout (your cwd): {}\n- Branch: {}\n- Base commit: {}",
        card.number,
        card.title,
        card.project_cwd,
        card.worktree_path.as_deref().unwrap_or("(not created)"),
        card.branch.as_deref().unwrap_or("(none)"),
        card.base_sha.as_deref().unwrap_or("(unknown)")
    );
    let mut sections = vec![header];
    if !skills.is_empty() {
        sections.push(format!(
            "## Skills\n{}\n\nApply every skill above. They were written for interactive work, so in this stage: do not stop to wait for\napproval or ask questions in chat (open questions go in the questions block), do not hand git commands to the\nuser instead of acting (writing stages commit themselves), and the Output contract below wins over any skill's\nown output format.",
            skills.iter().map(|name| format!("/{name}")).collect::<Vec<_>>().join(" ")
        ));
    }
    let mut rules = "## Rules\n- Work only inside the working checkout. Never push, never open pull requests, never switch branches.\n- Never add AI or tool attribution anywhere: no Co-authored-by, Generated-by or similar lines.\n- Do not mention any person by name in the artifacts you write; say \"the user\".\n- READ-ONLY stage: do not create, modify, stage or commit any file. MOLFAR compares the checkout before and after;\n  any change fails this stage. The git-ignored handoff folder `.molfar/board/` belongs to MOLFAR; leave it as is.".to_owned();
    if !stage.is_read_only() {
        let read_only = rules.find("- READ-ONLY").expect("fixed read-only rules");
        rules.truncate(read_only);
        rules.push_str("- Commit your work yourself with small, atomic Conventional Commits (`type(scope): subject`).\n- Finish with a clean working tree and at least one new commit, or this stage fails.");
    }
    sections.push(rules);
    sections.push(inputs(files, reading(stage, extras))?);
    if stage != crate::task_board::stage::agent::AgentStage::Grill {
        sections.extend(super::prompt_bodies::build(stage, card, head, extras));
        return Ok(sections.join("\n\n"));
    }
    let goal = if card.grill_round > 1 {
        format!("Grill round {}. Fold the user's answers and notes into the spec and plan. Do not re-ask settled questions.", card.grill_round)
    } else {
        "Analyze the repository and turn the task into a spec and an implementation plan.".into()
    };
    sections.extend([
        "## Goal".into(),
        goal,
        "Work the open decisions as a design tree: settle everything the code can answer yourself, and ask only what".into(),
        "the user must decide. Always produce a complete draft spec and plan, even when questions remain: the user may".into(),
        "approve the plan without answering. Emit the questions block only when a decision is genuinely open.".into(),
        "Size the plan so one Implement session can finish all of it, usually three or four execution stages, and map\nevery acceptance criterion to a stage and a test. When the task is clearly bigger than one card, ask about it\nin the questions block and propose a split into separate cards.".into(),
        "## Output\nEnd your final message with these blocks, exactly as delimited. MOLFAR saves them as files; anything outside\nthe blocks is ignored. Each block must be complete Markdown on its own.\n\n<<<MOLFAR:spec>>>\n---\npr_title: \"<conventional commit title for the eventual pull request>\"\n---\n# Spec — problem, done / acceptance criteria, scope and out of scope, constraints, risks\n<<<END:spec>>>\n<<<MOLFAR:plan>>>\n# Plan — Goal, Technical Approach, Architecture Overview, Risks & Mitigations, Execution Stages, Testing Strategy\n<<<END:plan>>>\n<<<MOLFAR:questions>>>\n## Q1 — <decision title>\n<the question, with concrete options>\n**Recommended:** <your recommended answer>\n(omit this whole block when nothing is open)\n<<<END:questions>>>".into(),
    ]);
    Ok(sections.join("\n\n"))
}
