use std::io::Read;
use std::path::Path;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

use crate::git::command::{git_cmd, git_status_ok};

/// Queued 8 KiB chunks allowed between the git reader and the consumer.
///
/// `max_bytes` caps the buffer being built, not what the reader can run ahead:
/// with an unbounded channel a slow or descheduled consumer lets the reader
/// queue output with no limit at all. A small bound instead lets git's own
/// stdout pipe (16 KiB on macOS, 64 KiB on Linux) fill and stall the child, so
/// a read now holds `max_bytes` plus this queue, one scratch chunk, and the
/// kernel's pipe — not `max_bytes` alone.
///
/// Cancelling is unaffected: the receiver is dropped on return, which unblocks
/// a reader parked in `send`. A reader parked in `read` instead is a different
/// case, and `stop` explains why that one is left detached.
const GIT_OUTPUT_QUEUE_CHUNKS: usize = 16;

pub(crate) fn git_output_capped(
    root: &Path,
    args: &[&str],
    max_bytes: usize,
    cancel: Option<&AtomicBool>,
) -> Option<(Vec<u8>, bool)> {
    let mut child = git_cmd(root)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    let Some(mut stdout) = child.stdout.take() else {
        let _ = child.kill();
        let _ = child.wait();
        return None;
    };
    let (sender, receiver) = mpsc::sync_channel(GIT_OUTPUT_QUEUE_CHUNKS);
    let reader = thread::Builder::new()
        .name("git-output-reader".to_string())
        .spawn(move || {
            let mut chunk = vec![0u8; 8192];
            loop {
                match stdout.read(&mut chunk) {
                    Ok(0) => {
                        let _ = sender.send(Ok(Vec::new()));
                        break;
                    }
                    Ok(read) => {
                        if sender.send(Ok(chunk[..read].to_vec())).is_err() {
                            break;
                        }
                    }
                    Err(error) => {
                        let _ = sender.send(Err(error));
                        break;
                    }
                }
            }
        });
    let mut reader = match reader {
        Ok(reader) => Some(reader),
        Err(_) => {
            let _ = child.kill();
            let _ = child.wait();
            return None;
        }
    };
    let stop = |child: &mut std::process::Child, reader: &mut Option<thread::JoinHandle<()>>| {
        let _ = child.kill();
        let _ = child.wait();
        // Dropping the handle detaches the reader. A killed git process can leave
        // a shell descendant holding the pipe, so joining here would re-block the
        // cancelled search until that unrelated descendant exits.
        reader.take();
    };

    let mut buf = Vec::new();
    loop {
        if cancel.is_some_and(|token| token.load(Ordering::Acquire)) {
            stop(&mut child, &mut reader);
            return None;
        }
        match receiver.recv_timeout(Duration::from_millis(100)) {
            Ok(Ok(chunk)) if chunk.is_empty() => break,
            Ok(Ok(chunk)) => {
                let remaining = max_bytes.saturating_sub(buf.len());
                if chunk.len() > remaining {
                    buf.extend_from_slice(&chunk[..remaining]);
                    stop(&mut child, &mut reader);
                    return Some((buf, true));
                }
                buf.extend_from_slice(&chunk);
            }
            Ok(Err(_)) => {
                stop(&mut child, &mut reader);
                return None;
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {
                if cancel.is_some_and(|token| token.load(Ordering::Acquire)) {
                    stop(&mut child, &mut reader);
                    return None;
                }
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                stop(&mut child, &mut reader);
                return None;
            }
        }
    }
    let _ = reader.take().map(thread::JoinHandle::join);
    let status = child.wait().ok()?;
    if git_status_ok(&status, args) {
        Some((buf, false))
    } else {
        None
    }
}

#[cfg(test)]
mod tests;
