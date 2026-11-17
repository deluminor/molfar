use super::{
    build_stage_prompt,
    stage_tests::card,
    status::{self, ImplStatus},
};
use crate::task_board::stage::agent::AgentStage;

const REPORT: &str = "# Implementation report\nStatus: complete\n## Summary\nDone.\n## Owner verification\n- [ ] AC-10: live OpenBot smoke against a paid account\n* Pair the device and send one message\n1. Rotate the staging credential\n## Checks run and results (lint, typecheck, tests)\nnative:check exit 0";

#[test]
fn complete_report_lists_owner_checks_without_changing_its_status() {
    assert_eq!(status::parse(REPORT).unwrap(), ImplStatus::Complete);
    assert_eq!(
        status::owner_checks(REPORT),
        [
            "AC-10: live OpenBot smoke against a paid account",
            "Pair the device and send one message",
            "Rotate the staging credential",
        ]
    );
}

#[test]
fn reports_without_real_owner_checks_list_none() {
    assert!(status::owner_checks("Status: complete\n## Summary\nDone.").is_empty());
    assert!(
        status::owner_checks("Status: complete\n## Owner verification\n- None\n\n## Commits")
            .is_empty()
    );
    assert!(status::owner_checks("Status: complete\n### owner verification:\nn/a").is_empty());
}

#[test]
fn writing_prompts_route_owner_only_checks_through_complete() {
    for stage in [AgentStage::Implement, AgentStage::Rework] {
        let prompt =
            build_stage_prompt(stage, &card(), &[], &[], "HEAD", &Default::default()).unwrap();

        assert!(prompt.contains("## Owner verification"));
        assert!(prompt.contains("never a reason for `Status: blocked`"));
        assert!(prompt.find("## Owner verification").unwrap() < prompt.find("## Output").unwrap());
    }
}

#[test]
fn review_prompt_keeps_owner_checks_out_of_rework() {
    let prompt = build_stage_prompt(
        AgentStage::CodeReview,
        &card(),
        &[],
        &[],
        "HEAD",
        &Default::default(),
    )
    .unwrap();

    assert!(prompt.contains("not yet verified"));
    assert!(prompt.contains("never a finding"));
    assert!(prompt.contains("## Owner verification\n- <check>: not yet verified"));
}
