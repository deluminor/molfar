use super::{build_stage_prompt, stage_tests::card, types};
use crate::task_board::stage::agent::AgentStage;

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

#[test]
fn an_unfilled_status_template_never_counts_as_done() {
    use super::status::{parse, ImplStatus};

    assert!(
        parse("# Implementation report\nStatus: complete | partial | blocked\n## Summary").is_err()
    );
    assert_eq!(
        parse("Status: complete | partial | blocked\n**Status:** partial — stages 4 and 5 remain")
            .unwrap(),
        ImplStatus::Partial
    );
    assert_eq!(parse("status: Complete.").unwrap(), ImplStatus::Complete);
    assert!(parse("The status is fine").is_err());
}

#[test]
fn a_resumed_run_is_not_told_it_is_a_fresh_session() {
    let extras = types::PromptExtras {
        resumed: true,
        ..Default::default()
    };
    let resumed =
        build_stage_prompt(AgentStage::Rework, &card(), &[], &[], "HEAD", &extras).unwrap();
    let fresh = build_stage_prompt(
        AgentStage::Rework,
        &card(),
        &[],
        &[],
        "HEAD",
        &Default::default(),
    )
    .unwrap();

    assert!(!resumed.contains("This is a fresh session"));
    assert!(resumed.contains("continues your earlier session") && resumed.contains("## Session"));
    assert!(fresh.contains("This is a fresh session") && !fresh.contains("## Session"));
}
