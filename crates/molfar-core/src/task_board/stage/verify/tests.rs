use super::{constants::TAIL_LINES, run, summary};
use std::time::Duration;

#[test]
fn passing_command_reports_success() {
    let dir = tempfile::tempdir().unwrap();
    let result = run(dir.path(), "echo ok", Duration::from_secs(10));

    assert!(result.passed);
    assert_eq!(result.exit, Some(0));
    assert_eq!(result.tail, "ok");
    assert!(summary(&result).contains("passed"));
}

#[test]
fn failing_command_keeps_exit_code_merged_output_and_tail() {
    let dir = tempfile::tempdir().unwrap();
    let script = format!(
        "pwd; i=0; while [ $i -lt {} ]; do echo line$i; i=$((i+1)); done; echo boom >&2; exit 3",
        TAIL_LINES + 50
    );
    let result = run(dir.path(), &script, Duration::from_secs(10));

    assert!(!result.passed);
    assert_eq!(result.exit, Some(3));
    assert!(result.tail.ends_with("boom"));
    assert_eq!(result.tail.lines().count(), TAIL_LINES);
    assert!(summary(&result).contains("exit code 3"));
}

#[test]
fn slow_command_times_out_and_stops_its_children() {
    let dir = tempfile::tempdir().unwrap();
    let started = std::time::Instant::now();
    let result = run(
        dir.path(),
        "sleep 30 & sleep 30; wait",
        Duration::from_millis(500),
    );

    assert!(result.timed_out);
    assert!(!result.passed);
    assert!(started.elapsed() < Duration::from_secs(10));
    assert!(summary(&result).contains("timed out"));
}

#[test]
fn checks_run_with_ci_set_in_the_given_checkout() {
    let dir = tempfile::tempdir().unwrap();
    let result = run(
        dir.path(),
        "test \"$CI\" = 1 && pwd",
        Duration::from_secs(10),
    );

    assert!(result.passed);
    let expected = std::fs::canonicalize(dir.path()).unwrap();
    assert_eq!(std::fs::canonicalize(result.tail.trim()).unwrap(), expected);
}

#[test]
fn background_workers_cannot_hold_the_run_open() {
    let dir = tempfile::tempdir().unwrap();
    let started = std::time::Instant::now();
    let result = run(dir.path(), "sleep 30 & echo done", Duration::from_secs(20));

    assert!(result.passed);
    assert!(started.elapsed() < Duration::from_secs(10));
}
