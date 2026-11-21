use std::collections::VecDeque;
use std::path::Path;

use super::super::cli::{Captured, Cli};
use super::{github_rollup, gitlab_rollup, map_pipeline, trace};
use crate::scm::{job_failed_log, pr_check_rollup};
use crate::task_board::delivery::ci::{
    evaluate, job_id, parse,
    types::{CheckState, CiState},
};

struct Script {
    calls: Vec<(String, Vec<String>)>,
    next: VecDeque<Result<Captured, String>>,
}

impl Script {
    fn ok(stdout: &str) -> Self {
        Self::result(Ok(Captured {
            stdout: stdout.into(),
            stderr: String::new(),
            ok: true,
        }))
    }

    fn result(result: Result<Captured, String>) -> Self {
        let mut next = VecDeque::new();
        next.push_back(result);
        Self {
            calls: Vec::new(),
            next,
        }
    }
}

impl Cli for Script {
    fn run(&mut self, program: &str, args: &[String]) -> Result<Captured, String> {
        self.calls.push((program.to_owned(), args.to_vec()));
        self.next
            .pop_front()
            .unwrap_or_else(|| Err("no scripted result".into()))
    }
}

#[test]
fn a_successful_job_passes_and_a_failed_job_exposes_its_id() {
    let passed = map_pipeline(
        r#"{"jobs":[{"name":"test","status":"success","web_url":"https://gitlab.com/g/p/-/jobs/4"}]}"#,
    )
    .unwrap();
    assert_eq!(evaluate(parse(&passed).unwrap(), 0), CiState::Passed);

    let failed = map_pipeline(
        r#"{"jobs":[{"name":"test","status":"failed","web_url":"https://gitlab.com/g/p/-/jobs/9"}]}"#,
    )
    .unwrap();
    let CiState::Failed(checks) = evaluate(parse(&failed).unwrap(), 0) else {
        panic!("expected failure");
    };
    assert_eq!(checks[0].state, CheckState::Failed);
    assert_eq!(job_id(checks[0].link.as_deref().unwrap()), Some("9"));
}

#[test]
fn a_pipeline_without_jobs_is_one_pipeline_check() {
    let mapped =
        map_pipeline(r#"{"status":"running","web_url":"https://gitlab.com/g/p/-/pipelines/3"}"#)
            .unwrap();
    let checks = parse(&mapped).unwrap();
    assert_eq!(checks.len(), 1);
    assert_eq!(checks[0].name, "pipeline");
    assert_eq!(checks[0].state, CheckState::Pending);
    assert!(map_pipeline("not json").is_err());
}

#[test]
fn no_pipeline_is_an_empty_rollup_and_other_failures_are_errors() {
    let url = "https://gitlab.com/g/p/-/merge_requests/8";
    let mut empty = Script::result(Ok(Captured {
        stdout: String::new(),
        stderr: "No pipeline for this merge request".into(),
        ok: false,
    }));
    let rollup = gitlab_rollup(&mut empty, url).unwrap();
    assert_eq!(rollup, r#"{"statusCheckRollup":[]}"#);
    assert!(!empty.calls[0].1.iter().any(|arg| arg == "--status"));
    assert_eq!(evaluate(parse(&rollup).unwrap(), 999_999), CiState::Passed);

    let mut broken = Script::ok("not json");
    assert!(gitlab_rollup(&mut broken, url).is_err());
    let mut denied = Script::result(Ok(Captured {
        stdout: String::new(),
        stderr: "401 Unauthorized".into(),
        ok: false,
    }));
    let error = gitlab_rollup(&mut denied, url).unwrap_err();
    assert!(error.contains("glab") || error.contains("GitLab"));
    assert!(!error.contains("statusCheckRollup"));
}

#[test]
fn github_rollup_stdout_is_unchanged_and_trace_uses_the_job_id() {
    let raw = r#"{"statusCheckRollup":[{"name":"lint"}]}"#;
    let mut cli = Script::ok(raw);
    assert_eq!(
        github_rollup(&mut cli, "https://github.com/o/r/pull/4").unwrap(),
        raw
    );
    assert_eq!(cli.calls[0].0, "gh");
    assert!(cli.calls.iter().all(|(program, _)| program != "glab"));

    let mut trace_cli = Script::ok("log tail");
    assert_eq!(trace(&mut trace_cli, "9").unwrap(), "log tail");
    assert_eq!(trace_cli.calls[0].1, ["ci", "trace", "9"]);
}

#[test]
fn remote_check_and_log_stay_local_only() {
    let cwd = Path::new("remote://env/project");
    assert_eq!(
        pr_check_rollup(cwd, "https://gitlab.com/g/p/-/merge_requests/1").unwrap_err(),
        "CI status is local only"
    );
    assert_eq!(
        job_failed_log(cwd, "9").unwrap_err(),
        "CI logs are local only"
    );
}
