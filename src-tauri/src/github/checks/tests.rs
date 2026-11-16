use super::*;

#[test]
fn github_status_context_keeps_its_report_time() {
    let checks = parse_github_pr_checks(
        r#"{
            "headRefOid": "abc",
            "statusCheckRollup": [{
                "__typename": "StatusContext", "context": "External tests",
                "state": "SUCCESS", "createdAt": "2030-01-01T10:00:00Z",
                "targetUrl": "https://ci.example/project/web"
            }]
        }"#,
    )
    .unwrap();
    assert_eq!(
        checks.checks[0].started_at.as_deref(),
        Some("2030-01-01T10:00:00Z")
    );
}

#[test]
fn github_pr_checks_args_target_repo_and_number() {
    assert_eq!(
        github_pr_checks_args("acme/web", 42).unwrap(),
        [
            "pr",
            "view",
            "42",
            "--repo",
            "acme/web",
            "--json",
            "headRefOid,statusCheckRollup"
        ]
    );
    assert!(github_pr_checks_args("acme/web", 0).is_err());
    assert!(github_pr_checks_args("invalid", 42).is_err());
}

#[test]
fn parse_github_pr_checks_maps_check_run_states() {
    let json = r#"{
            "headRefOid": "abc123",
            "statusCheckRollup": [
                {
                    "__typename": "CheckRun",
                    "name": "build",
                    "status": "COMPLETED",
                    "conclusion": "SUCCESS",
                    "workflowName": "CI",
                    "detailsUrl": "https://github.com/acme/web/actions/runs/1",
                    "startedAt": "2026-09-16T10:00:00Z",
                    "completedAt": "2026-09-16T10:05:00Z"
                },
                {
                    "__typename": "CheckRun",
                    "name": "e2e",
                    "status": "IN_PROGRESS",
                    "conclusion": "FAILURE",
                    "workflowName": "E2E",
                    "detailsUrl": "https://github.com/acme/web/actions/runs/2",
                    "startedAt": "2026-09-16T11:00:00Z"
                },
                {
                    "__typename": "CheckRun",
                    "name": "scan",
                    "status": "COMPLETED",
                    "conclusion": "ACTION_REQUIRED"
                }
            ]
        }"#;
    let checks = parse_github_pr_checks(json).unwrap();
    assert_eq!(checks.head_oid, "abc123");
    assert_eq!(checks.checks.len(), 3);
    let build = &checks.checks[0];
    assert_eq!(build.name, "build");
    assert_eq!(build.state, "pass");
    assert_eq!(build.workflow, "CI");
    assert_eq!(
        build.url.as_deref(),
        Some("https://github.com/acme/web/actions/runs/1")
    );
    assert_eq!(build.started_at.as_deref(), Some("2026-09-16T10:00:00Z"));
    assert_eq!(build.completed_at.as_deref(), Some("2026-09-16T10:05:00Z"));
    let e2e = &checks.checks[1];
    assert_eq!(e2e.state, "pending");
    assert_eq!(e2e.completed_at, None);
    assert_eq!(checks.checks[2].state, "fail");
}

#[test]
fn parse_github_pr_checks_maps_status_context_states() {
    let json = r#"{
            "headRefOid": "abc123",
            "statusCheckRollup": [
                {
                    "__typename": "StatusContext",
                    "context": "ci/lab",
                    "state": "SUCCESS",
                    "targetUrl": "https://ci.example.com/1"
                },
                {
                    "__typename": "StatusContext",
                    "context": "security/scan",
                    "state": "FAILURE",
                    "targetUrl": "https://ci.example.com/2"
                },
                {
                    "__typename": "StatusContext",
                    "context": "legacy/status",
                    "state": "PENDING"
                }
            ]
        }"#;
    let checks = parse_github_pr_checks(json).unwrap();
    let lab = &checks.checks[0];
    assert_eq!(lab.name, "ci/lab");
    assert_eq!(lab.state, "pass");
    assert_eq!(lab.workflow, "");
    assert_eq!(lab.url.as_deref(), Some("https://ci.example.com/1"));
    assert_eq!(lab.started_at, None);
    assert_eq!(lab.completed_at, None);
    assert_eq!(checks.checks[1].state, "fail");
    let legacy = &checks.checks[2];
    assert_eq!(legacy.state, "pending");
    assert_eq!(legacy.url, None);
}

#[test]
fn parse_github_pr_checks_combines_rollup_states_and_unknown_values() {
    let json = r#"{
            "headRefOid": "abc123",
            "statusCheckRollup": [
                {"__typename": "CheckRun", "name": "lint", "status": "COMPLETED", "conclusion": "SKIPPED"},
                {"__typename": "CheckRun", "name": "announce", "status": "COMPLETED", "conclusion": "CANCELLED"},
                {"__typename": "CheckRun", "name": "unit", "status": "COMPLETED", "conclusion": "TIMED_OUT"},
                {"__typename": "CheckRun", "name": "stale", "status": "COMPLETED", "conclusion": "STALE"},
                {"__typename": "StatusContext", "context": "deploy/expected", "state": "EXPECTED"},
                {"__typename": "CheckRun", "name": "plan", "status": "QUEUED", "conclusion": "SUCCESS"}
            ]
        }"#;
    let checks = parse_github_pr_checks(json).unwrap();
    let states: Vec<&str> = checks.checks.iter().map(|c| c.state.as_str()).collect();
    assert_eq!(
        states,
        ["skipping", "cancel", "fail", "unknown", "unknown", "pending"]
    );
}

#[test]
fn parse_github_pr_checks_unknown_status_never_trusts_conclusion() {
    let json = r#"{
            "headRefOid": "abc123",
            "statusCheckRollup": [
                {
                    "__typename": "CheckRun",
                    "name": "mystery",
                    "status": "RUNNING",
                    "conclusion": "SUCCESS"
                },
                {"__typename": "CheckRun", "name": "done", "status": "COMPLETED", "conclusion": "SUCCESS"},
                {"__typename": "CheckRun", "name": "legacy", "conclusion": "SUCCESS"}
            ]
        }"#;
    let checks = parse_github_pr_checks(json).unwrap();
    assert_eq!(checks.checks[0].state, "unknown");
    assert_eq!(checks.checks[1].state, "pass");
    assert_eq!(checks.checks[2].state, "pass");
}

#[test]
fn parse_github_pr_checks_treats_missing_rollup_as_empty() {
    let checks = parse_github_pr_checks(r#"{"headRefOid": "abc123"}"#).unwrap();
    assert_eq!(checks.head_oid, "abc123");
    assert!(checks.checks.is_empty());
    let null_checks =
        parse_github_pr_checks(r#"{"headRefOid": "abc123", "statusCheckRollup": null}"#).unwrap();
    assert!(null_checks.checks.is_empty());
}

#[test]
fn parse_github_pr_checks_fills_missing_check_data() {
    let json = r#"{
            "headRefOid": "abc123",
            "statusCheckRollup": [
                {"__typename": "CheckRun", "status": "COMPLETED"},
                {"__typename": "CheckRun", "name": "legacy", "conclusion": "SUCCESS"},
                {"context": "fallback/status", "state": "SUCCESS"}
            ]
        }"#;
    let checks = parse_github_pr_checks(json).unwrap();
    let bare = &checks.checks[0];
    assert_eq!(bare.name, "");
    assert_eq!(bare.workflow, "");
    assert_eq!(bare.state, "unknown");
    assert_eq!(bare.url, None);
    assert_eq!(bare.started_at, None);
    assert_eq!(bare.completed_at, None);
    assert_eq!(checks.checks[1].state, "pass");
    let fallback = &checks.checks[2];
    assert_eq!(fallback.name, "fallback/status");
    assert_eq!(fallback.state, "pass");
    assert_eq!(fallback.workflow, "");
}

#[test]
fn parse_github_pr_checks_rejects_invalid_responses() {
    assert!(parse_github_pr_checks("not json").is_err());
    assert!(parse_github_pr_checks(r#"{"statusCheckRollup": []}"#).is_err());
    assert!(parse_github_pr_checks(r#"{"headRefOid": "", "statusCheckRollup": []}"#).is_err());
    assert!(
        parse_github_pr_checks(r#"{"headRefOid": "abc", "statusCheckRollup": ["nope"]}"#).is_err()
    );
}
