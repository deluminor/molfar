use super::constants::{DRAIN, POLL};
use std::io::Read;
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::{mpsc, Arc, Mutex};
use std::time::{Duration, Instant};

#[cfg(windows)]
fn shell(command: &str) -> Command {
    use std::os::windows::process::CommandExt;

    // cmd parses its own command line: `/S` strips exactly the outer quotes, so the
    // command reaches cmd verbatim instead of through Rust's argument quoting.
    let mut shell = Command::new("cmd");
    shell.raw_arg(format!("/D /S /C \"{command}\""));
    shell
}

#[cfg(not(windows))]
fn shell(command: &str) -> Command {
    use std::os::unix::process::CommandExt;

    let mut shell = Command::new("sh");
    shell.args(["-c", command]);
    shell.process_group(0);
    shell
}

/// Runs `command` with stdout and stderr merged; returns exit code, timeout flag and log.
pub(super) fn run(
    cwd: &Path,
    command: &str,
    timeout: Duration,
) -> Result<(Option<i32>, bool, String), String> {
    let (reader, writer) = std::io::pipe().map_err(|e| e.to_string())?;
    let errors = writer.try_clone().map_err(|e| e.to_string())?;
    let mut shell = shell(command);
    crate::scm::shell::apply_gui_env(&mut shell);
    crate::process::configure_child(&mut shell);
    shell
        .current_dir(cwd)
        .env("CI", "1")
        .stdin(Stdio::null())
        .stdout(writer)
        .stderr(errors);
    let mut child = shell.spawn().map_err(|e| e.to_string())?;
    drop(shell);

    let (log, drained) = collect(reader);
    let started = Instant::now();
    let (status, timed_out) = loop {
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            break (Some(status), false);
        }
        if started.elapsed() >= timeout {
            stop_tree(&mut child);
            break (child.wait().ok(), true);
        }
        std::thread::sleep(POLL);
    };
    stop_group(&child);

    // A worker that outlived the command may still hold the pipe; keep what arrived.
    let _ = drained.recv_timeout(DRAIN);
    let bytes = log.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let text = String::from_utf8_lossy(&bytes).into_owned();
    Ok((status.and_then(|status| status.code()), timed_out, text))
}

/// Reads the merged output on its own thread; the receiver fires at end of output.
fn collect(mut reader: std::io::PipeReader) -> (Arc<Mutex<Vec<u8>>>, mpsc::Receiver<()>) {
    let log = Arc::new(Mutex::new(Vec::new()));
    let sink = log.clone();
    let (done, drained) = mpsc::channel();

    std::thread::spawn(move || {
        let mut chunk = [0_u8; 8192];
        while let Ok(read) = reader.read(&mut chunk) {
            if read == 0 {
                break;
            }
            sink.lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .extend_from_slice(&chunk[..read]);
        }
        let _ = done.send(());
    });
    (log, drained)
}

/// Stops the command and every process it started (npm, test workers).
fn stop_tree(child: &mut Child) {
    #[cfg(windows)]
    {
        let mut taskkill = Command::new("taskkill");
        taskkill.args(["/T", "/F", "/PID", &child.id().to_string()]);
        crate::process::configure_child(&mut taskkill);
        if let Err(error) = taskkill.output() {
            eprintln!("verify: taskkill failed for {}: {error}", child.id());
        }
    }
    stop_group(child);
    let _ = child.kill();
}

/// On Unix the shell leads its own process group, so stray workers stop with it and
/// cannot hold the output pipe open after the command ends.
fn stop_group(child: &Child) {
    #[cfg(not(windows))]
    if let Ok(group) = libc::pid_t::try_from(child.id()) {
        // SAFETY: signalling a process group this module created; no memory is shared.
        unsafe { libc::kill(-group, libc::SIGKILL) };
    }
    #[cfg(windows)]
    let _ = child;
}
