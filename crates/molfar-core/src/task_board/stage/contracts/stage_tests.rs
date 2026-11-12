use super::*;
use crate::task_board::stage::{
    agent::AgentStage,
    checkout::{policy, types::CheckoutSnapshot},
};

fn card() -> crate::task_board::types::Card {
    crate::task_board::types::Card {
        id: "abc123-card".into(),
        number: 7,
        project_cwd: "/code/app".into(),
        title: "Add board".into(),
        description: "This body must not be embedded".into(),
        acceptance_criteria: String::new(),
        column_id: "grill".into(),
        run_state: "running".into(),
        position: 1.,
        base_ref: Some("main".into()),
        base_sha: Some("a".repeat(40)),
        branch: Some("molfar/task-abc123-add-board".into()),
        worktree_path: Some("/code/app-worktrees/task-7".into()),
        grill_round: 1,
        rework_cycle: 0,
        overrides_json: "{}".into(),
        last_error: None,
        delivery_json: None,
        archived: false,
        queued_at: None,
        created_at: 1,
        updated_at: 1,
    }
}

#[test]
fn every_execution_prompt_matches_the_executed_desktop_template() {
    for (stage, expected) in [
        (AgentStage::Implement, include_str!("fixtures/implement.md")),
        (
            AgentStage::CodeReview,
            include_str!("fixtures/code_review.md"),
        ),
        (AgentStage::Rework, include_str!("fixtures/rework.md")),
    ] {
        let contract = input_contract(stage, 1);
        let files = contract
            .required
            .iter()
            .chain(contract.optional)
            .map(|kind| types::ManifestReference {
                kind: (*kind).into(),
                version: 2,
                path: format!(".molfar/board/{kind}-v2.md"),
            })
            .collect::<Vec<_>>();
        let prompt = build_stage_prompt(
            stage,
            &card(),
            &files,
            &[],
            &"b".repeat(40),
            &Default::default(),
        )
        .unwrap();
        assert_eq!(prompt, expected, "{}", stage.id());
        assert!(!prompt.contains("This body must not be embedded"));
    }
}

#[test]
fn continuation_runs_point_the_agent_at_the_previous_report_and_commits() {
    for stage in [AgentStage::Implement, AgentStage::Rework] {
        let fresh =
            build_stage_prompt(stage, &card(), &[], &[], "HEAD", &Default::default()).unwrap();
        let extras = types::PromptExtras {
            continuation: 2,
            ..Default::default()
        };
        let continued = build_stage_prompt(stage, &card(), &[], &[], "HEAD", &extras).unwrap();

        assert!(!fresh.contains("## Continuation"));
        assert!(continued.contains("continuation run 2"));
        assert!(continued.contains(&format!("git log {}..HEAD", "a".repeat(40))));
    }
}

#[test]
fn output_contracts_refuse_missing_and_malformed_stage_results() {
    for stage in [AgentStage::Implement, AgentStage::Rework] {
        assert!(read_stage_output(stage, "<<<MOLFAR:spec>>>wrong<<<END:spec>>>").is_err());
        assert!(
            read_stage_output(stage, "<<<MOLFAR:impl_report>>>  <<<END:impl_report>>>").is_err()
        );
        assert!(
            read_stage_output(stage, "<<<MOLFAR:impl_report>>>report<<<END:impl_report>>>")
                .unwrap_err()
                .contains("Status")
        );
        let output = read_stage_output(
            stage,
            "<<<MOLFAR:impl_report>>>**Status:** partial\nreport<<<END:impl_report>>>",
        )
        .unwrap();
        assert_eq!(output[0].kind, constants::IMPL_REPORT);
    }
    assert!(read_stage_output(
        AgentStage::CodeReview,
        "<<<MOLFAR:review>>>no verdict<<<END:review>>>"
    )
    .is_err());
    let output = read_stage_output(
        AgentStage::CodeReview,
        "<<<MOLFAR:review>>>Verdict: APPROVE<<<END:review>>>",
    )
    .unwrap();
    assert_eq!(output.len(), 1);
    let output = read_stage_output(AgentStage::CodeReview, "<<<MOLFAR:review>>>Verdict: CHANGES_REQUESTED<<<END:review>>>\n<<<MOLFAR:pr_description>>>description<<<END:pr_description>>>").unwrap();
    assert_eq!(output.len(), 2);
}

#[test]
fn review_findings_and_rework_brief_preserve_desktop_selection_and_format() {
    let parsed = review::parse("\nVerdict: changes_requested\r\n\r\n## f1 [MAJOR] Fix race\r\nFile: src/task.rs:12\r\nDetail.\r\n\r\n## F2 [nit] Rename\r\nSmall.").unwrap();
    assert_eq!(parsed.verdict, types::ReviewVerdict::ChangesRequested);
    assert_eq!(parsed.findings[0].id, "F1");
    assert!(parsed.findings[0].severity.selected_by_default());
    assert!(!parsed.findings[1].severity.selected_by_default());
    assert_eq!(
        review::rework_brief(&parsed.findings, &["F1".into()], " Keep scope ").unwrap(),
        "## F1 [major] Fix race\nFile: src/task.rs:12\n\nDetail.\n\n## Note\n\nKeep scope"
    );
    assert!(review::rework_brief(&parsed.findings, &["F9".into()], "").is_err());
    assert_eq!(
        review::rework_brief(&[], &[], "note").unwrap(),
        "## Note\n\nnote"
    );
    assert!(review::parse("Summary\nVerdict: APPROVE").is_err());
}

#[test]
fn stage_checkout_policy_keeps_read_only_strict_and_writing_committed() {
    let clean = CheckoutSnapshot {
        head: "a".repeat(40),
        porcelain: String::new(),
        fingerprint: "before".into(),
    };
    let mut dirty = clean.clone();
    dirty.porcelain = " M file".into();
    dirty.fingerprint = "changed".into();
    let mut committed = clean.clone();
    committed.head = "b".repeat(40);
    committed.fingerprint = "committed".into();
    for stage in AgentStage::ALL {
        assert!(policy::before(stage, &clean).is_ok());
        if stage.is_read_only() {
            assert!(policy::before(stage, &dirty).is_ok());
            assert!(policy::after(stage, &clean, &clean).is_ok());
            assert!(policy::after(stage, &clean, &dirty).is_err());
            assert!(policy::after(stage, &clean, &committed).is_err());
        } else {
            assert!(policy::before(stage, &dirty).is_err());
            assert!(policy::after(stage, &clean, &clean).is_err());
            assert!(policy::after(stage, &clean, &dirty).is_err());
            assert!(policy::after(stage, &clean, &committed).is_ok());
        }
    }
}

#[test]
fn review_prompt_states_engine_checks_only_when_they_ran() {
    let plain = build_stage_prompt(
        AgentStage::CodeReview,
        &card(),
        &[],
        &[],
        "HEAD",
        &Default::default(),
    )
    .unwrap();
    let extras = types::PromptExtras {
        checks: Some("`npm run check:web` failed with exit code 1.".into()),
        ..Default::default()
    };
    let checked =
        build_stage_prompt(AgentStage::CodeReview, &card(), &[], &[], "HEAD", &extras).unwrap();

    assert!(!plain.contains("## Checks"));
    assert!(checked.contains("## Checks\nMOLFAR ran the project's verify command before this review: `npm run check:web` failed"));
    assert!(checked.find("## Checks").unwrap() < checked.find("## Output").unwrap());
}

#[test]
fn later_runs_read_the_newest_handoff_first() {
    let prompt = |stage, extras: types::PromptExtras| {
        build_stage_prompt(stage, &card(), &[], &[], "HEAD", &extras).unwrap()
    };
    let everything = "Read every file below before you start";

    assert!(prompt(AgentStage::Implement, Default::default()).contains(everything));
    let continued = prompt(
        AgentStage::Implement,
        types::PromptExtras {
            continuation: 1,
            ..Default::default()
        },
    );
    assert!(continued.contains("Start with the latest implementation report"));
    assert!(prompt(AgentStage::Rework, Default::default()).contains("Start with the rework brief"));

    let first = prompt(AgentStage::CodeReview, Default::default());
    assert!(first.contains(everything) && !first.contains("follow-up review"));
    let follow_up = prompt(
        AgentStage::CodeReview,
        types::PromptExtras {
            reviewed_head: Some("c0ffee".into()),
            ..Default::default()
        },
    );
    assert!(follow_up.contains("Start with the previous review"));
    assert!(follow_up.contains("Review `git diff c0ffee..HEAD` closely"));
}
