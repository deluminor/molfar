//! Runs a project's verify command in a card checkout so the engine, not the agent,
//! decides whether the work is green.
pub mod constants;
mod output;
mod process;
#[cfg(test)]
mod tests;
pub mod types;

use std::path::Path;
use std::time::Duration;
use types::CheckRun;

pub fn run(cwd: &Path, command: &str, timeout: Duration) -> CheckRun {
    let (exit, timed_out, log) = match process::run(cwd, command, timeout) {
        Ok(result) => result,
        Err(error) => (
            None,
            false,
            format!("Could not start the verify command: {error}"),
        ),
    };

    CheckRun {
        command: command.to_owned(),
        passed: exit == Some(0) && !timed_out,
        exit,
        timed_out,
        tail: output::tail(&log),
    }
}

/// The checks paragraph for a review prompt or a rework brief.
pub fn summary(run: &CheckRun) -> String {
    if run.passed {
        return format!("`{}` passed in this checkout.", run.command);
    }

    let status = match (run.timed_out, run.exit) {
        (true, _) => "timed out".to_owned(),
        (false, Some(code)) => format!("failed with exit code {code}"),
        (false, None) => "failed to run".to_owned(),
    };
    format!(
        "`{}` {status} in this checkout. Last lines of its output:\n\n```text\n{}\n```",
        run.command, run.tail
    )
}
