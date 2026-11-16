use super::{
    brief, evaluate, job_id, parse,
    types::{CheckState, CiState},
};

const ROLLUP: &str = r#"{"statusCheckRollup":[
  {"__typename":"CheckRun","name":"check (ubuntu)","status":"COMPLETED","conclusion":"FAILURE","detailsUrl":"https://github.com/o/r/actions/runs/11/job/22"},
  {"__typename":"CheckRun","name":"browser","status":"IN_PROGRESS","conclusion":"","detailsUrl":"https://github.com/o/r/actions/runs/11/job/23"},
  {"__typename":"CheckRun","name":"lint","status":"COMPLETED","conclusion":"SKIPPED"},
  {"__typename":"StatusContext","context":"vercel","state":"SUCCESS","targetUrl":"https://vercel.com/x"}
]}"#;

#[test]
fn rollup_reads_actions_runs_and_commit_statuses() {
    let checks = parse(ROLLUP).unwrap();
    let states: Vec<_> = checks
        .iter()
        .map(|check| (check.name.as_str(), check.state))
        .collect();

    assert_eq!(
        states,
        [
            ("check (ubuntu)", CheckState::Failed),
            ("browser", CheckState::Pending),
            ("lint", CheckState::Passed),
            ("vercel", CheckState::Passed),
        ]
    );
    assert!(parse("not json").is_err());
}

#[test]
fn a_failure_is_final_pending_waits_and_empty_waits_for_the_grace_period() {
    let checks = parse(ROLLUP).unwrap();
    let CiState::Failed(failed) = evaluate(checks.clone(), 0) else {
        panic!("expected failure");
    };
    assert_eq!(failed.len(), 1);

    let pending: Vec<_> = checks
        .into_iter()
        .filter(|check| check.state != CheckState::Failed)
        .collect();
    assert_eq!(evaluate(pending, 999_999), CiState::Pending);
    assert_eq!(evaluate(Vec::new(), 1_000), CiState::Pending);
    assert_eq!(evaluate(Vec::new(), 999_999), CiState::Passed);
    assert_eq!(
        evaluate(parse(r#"{"statusCheckRollup":[]}"#).unwrap(), 999_999),
        CiState::Passed
    );
}

#[test]
fn job_ids_come_only_from_actions_job_links() {
    assert_eq!(
        job_id("https://github.com/o/r/actions/runs/11/job/22"),
        Some("22")
    );
    assert_eq!(
        job_id("https://github.com/o/r/actions/runs/11/job/22?pr=4"),
        Some("22")
    );
    assert_eq!(job_id("https://vercel.com/x"), None);
    assert_eq!(job_id("https://github.com/o/r/job/abc"), None);
}

#[test]
fn brief_lists_failed_checks_and_bounded_log_tails() {
    let failed = parse(ROLLUP)
        .unwrap()
        .into_iter()
        .take(1)
        .collect::<Vec<_>>();
    let log = (0..400)
        .map(|line| format!("line {line}"))
        .collect::<Vec<_>>()
        .join("\n");
    let text = brief(
        "https://github.com/o/r/pull/4",
        &failed,
        &[("check (ubuntu)".into(), log)],
    );

    assert!(text.starts_with("## CI failed"));
    assert!(text.contains("- check (ubuntu) (https://github.com/o/r/actions/runs/11/job/22)"));
    assert!(text.contains("line 399") && !text.contains("line 100\n"));
    assert!(text.ends_with("Do not skip, disable or weaken checks."));
}
