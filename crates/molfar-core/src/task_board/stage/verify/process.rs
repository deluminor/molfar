use super::constants::POLL;
use std::io::Read;
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

fn shell(command: &str) -> Command {
    #[cfg(windows)]
    {
        let mut shell = Command::new("cmd");
        shell.args(["/C", command]);
        shell
    }
    #[cfg(not(windows))]
    {
        use std::os::unix::process::CommandExt;
        let mut shell = Command::new("sh");
        shell.args(["-c", command]);
        shell.process_group(0);
        shell
    }
}

/// Runs `command` with stdout and stderr merged; returns exit code, timeout flag and log.
pub(super) fn run(
    cwd: &Path,
    command: &str,
    timeout: Duration,
) -> Result<(Option<i32>, bool, String), String> {
    let (mut reader, writer) = std::io::pipe().map_err(|e| e.to_string())?;
    let errors = writer.try_clone().map_err(|e| e.to_string())?;
    let mut shell = shell(command);
    crate::scm::shell::apply_gui_env(&mut shell);
    shell
        .current_dir(cwd)
        .env("CI", "1")
        .stdin(Stdio::null())
        .stdout(writer)
        .stderr(errors);
    let mut child = shell.spawn().map_err(|e| e.to_string())?;
    drop(shell);

    let collector = std::thread::spawn(move || {
        let mut log = Vec::new();
        let _ = reader.read_to_end(&mut log);
        String::from_utf8_lossy(&log).into_owned()
    });

    let started = Instant::now();
    let (status, timed_out) = loop {
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            break (Some(status), false);
        }
        if started.elapsed() >= timeout {
            stop(&mut child);
            break (child.wait().ok(), true);
        }
        std::thread::sleep(POLL);
    };
    stop_group(&child);

    let log = collector.join().unwrap_or_default();
    Ok((status.and_then(|status| status.code()), timed_out, log))
}

fn stop(child: &mut std::process::Child) {
    stop_group(child);
    let _ = child.kill();
}

/// The shell leads its own process group, so stray workers (npm, vitest) stop with it
/// and cannot hold the output pipe open after the command ends.
fn stop_group(child: &std::process::Child) {
    #[cfg(not(windows))]
    if let Ok(group) = libc::pid_t::try_from(child.id()) {
        // SAFETY: signalling a process group this function's caller created; no memory is shared.
        unsafe { libc::kill(-group, libc::SIGKILL) };
    }
    #[cfg(windows)]
    let _ = child;
}
