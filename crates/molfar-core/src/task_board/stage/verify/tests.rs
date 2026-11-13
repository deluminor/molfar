use super::{constants::TAIL_LINES, run, summary};
use std::time::{Duration, Instant};

/// The same checks in each platform's shell: `sh -c` on Unix, `cmd /S /C` on Windows.
#[cfg(not(windows))]
mod script {
    pub fn failing(lines: usize) -> String {
        format!("i=0; while [ $i -lt {lines} ]; do echo line$i; i=$((i+1)); done; echo boom >&2; exit 3")
    }
    pub const SLOW: &str = "sleep 30 & sleep 30; wait";
    pub const BACKGROUND: &str = "sleep 30 & echo done";
    pub const CI_CWD: &str = "test \"$CI\" = 1 && pwd";
}

#[cfg(windows)]
mod script {
    pub fn failing(lines: usize) -> String {
        format!("(for /L %i in (1,1,{lines}) do @echo line%i) & 1>&2 echo boom & exit 3")
    }
    pub const SLOW: &str = "ping -n 30 127.0.0.1 >nul";
    pub const BACKGROUND: &str = "start /b ping -n 30 127.0.0.1 & echo done";
    pub const CI_CWD: &str = "if \"%CI%\"==\"1\" cd";
}

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
    let result = run(
        dir.path(),
        &script::failing(TAIL_LINES + 50),
        Duration::from_secs(20),
    );

    assert!(!result.passed);
    assert_eq!(result.exit, Some(3));
    assert!(result.tail.ends_with("boom"));
    assert_eq!(result.tail.lines().count(), TAIL_LINES);
    assert!(summary(&result).contains("exit code 3"));
}

#[test]
fn slow_command_times_out_and_stops_its_children() {
    let dir = tempfile::tempdir().unwrap();
    let started = Instant::now();
    let result = run(dir.path(), script::SLOW, Duration::from_millis(500));

    assert!(result.timed_out);
    assert!(!result.passed);
    assert!(started.elapsed() < Duration::from_secs(10));
    assert!(summary(&result).contains("timed out"));
}

#[test]
fn checks_run_with_ci_set_in_the_given_checkout() {
    let dir = tempfile::tempdir().unwrap();
    let result = run(dir.path(), script::CI_CWD, Duration::from_secs(10));

    assert!(result.passed, "{}", result.tail);
    let expected = std::fs::canonicalize(dir.path()).unwrap();
    assert_eq!(std::fs::canonicalize(result.tail.trim()).unwrap(), expected);
}

#[test]
fn background_workers_cannot_hold_the_run_open() {
    let dir = tempfile::tempdir().unwrap();
    let started = Instant::now();
    let result = run(dir.path(), script::BACKGROUND, Duration::from_secs(20));

    assert!(result.passed, "{}", result.tail);
    assert!(result.tail.contains("done"));
    assert!(started.elapsed() < Duration::from_secs(10));
}
