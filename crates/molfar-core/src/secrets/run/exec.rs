use secrecy::{zeroize::Zeroize, ExposeSecret};
use std::{
    io::Read,
    path::PathBuf,
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc,
    },
    time::{Duration, Instant},
};

use super::{Outcome, Request, SecretName, OUTPUT_LIMIT};
use crate::secrets::{redact::StreamRedactor, Redactor, SecretValue};

#[derive(Clone, Default)]
pub struct Cancellation {
    stopped: Arc<AtomicBool>,
    parent: Option<Arc<AtomicBool>>,
}

impl Cancellation {
    pub fn cancel(&self) {
        self.stopped.store(true, Ordering::Release);
    }

    pub fn child(&self) -> Self {
        Self {
            parent: Some(self.stopped.clone()),
            ..Self::default()
        }
    }

    fn cancelled(&self) -> bool {
        self.stopped.load(Ordering::Acquire)
            || self
                .parent
                .as_ref()
                .is_some_and(|parent| parent.load(Ordering::Acquire))
    }
}

pub struct Prepared {
    pub(super) request: Request,
    pub(super) cwd: PathBuf,
    pub(super) names: Vec<SecretName>,
    pub(super) values: Vec<SecretValue>,
    pub(super) redactor: Redactor,
}

impl Prepared {
    pub fn with_ephemeral(mut self, ephemeral: crate::secrets::ephemeral::Ephemeral) -> Self {
        self.redactor = self.redactor.with_ephemeral(ephemeral);
        self
    }

    pub fn execute(self, cancel: &Cancellation) -> Result<Outcome, String> {
        if cancel.cancelled() {
            return Err("App run cancelled.".into());
        }
        let executable = std::path::Path::new(&self.request.argv[0]);
        let executable = if executable.is_relative() && executable.components().count() > 1 {
            self.cwd.join(executable)
        } else {
            executable.to_owned()
        };
        let mut command = Command::new(executable);
        command
            .args(&self.request.argv[1..])
            .current_dir(&self.cwd)
            .env_clear()
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        #[cfg(windows)]
        for name in ["SystemRoot", "WINDIR"] {
            if let Some(value) = std::env::var_os(name) {
                command.env(name, value);
            }
        }
        crate::scm::shell::apply_gui_env(&mut command);
        crate::process::isolate(&mut command);
        for (injection, value) in self.request.secrets.iter().zip(&self.values) {
            command.env(injection.env.as_str(), value.0.expose_secret());
        }

        let start = Instant::now();
        let timeout = Duration::from_secs(self.request.timeout_secs());
        let mut child = command
            .spawn()
            .map_err(|_| "Could not start app run command.")?;
        drop(command);
        let stdout = capture(
            child.stdout.take().expect("piped stdout"),
            self.redactor.clone(),
        );
        let cwd = self.redactor.text(&self.cwd.to_string_lossy()).into();
        let stderr = capture(child.stderr.take().expect("piped stderr"), self.redactor);
        let mut status = None;
        let mut out = None;
        let mut err = None;
        let mut timed_out = false;
        loop {
            if out.is_none() {
                out = stdout.try_recv().ok();
            }
            if err.is_none() {
                err = stderr.try_recv().ok();
            }
            if status.is_none() {
                status = match child.try_wait() {
                    Ok(status) => status,
                    Err(_) => {
                        crate::process::terminate(&mut child);
                        return Err("Could not read app run exit status.".into());
                    }
                };
            }
            if status.is_some() && out.is_some() && err.is_some() {
                break;
            }
            timed_out = start.elapsed() >= timeout;
            if timed_out || cancel.cancelled() {
                crate::process::terminate(&mut child);
                status = child.wait().ok();
                break;
            }
            std::thread::sleep(Duration::from_millis(15));
        }

        let (stdout, stdout_truncated) = captured(out, stdout)?;
        let (stderr, stderr_truncated) = captured(err, stderr)?;
        #[cfg(unix)]
        let signal = {
            use std::os::unix::process::ExitStatusExt;
            status.and_then(|status| status.signal())
        };
        #[cfg(not(unix))]
        let signal = None;
        Ok(Outcome {
            exit_code: status.and_then(|status| status.code()),
            signal,
            timed_out,
            duration_ms: start.elapsed().as_millis(),
            stdout,
            stderr,
            truncated: stdout_truncated || stderr_truncated,
            secrets: self.names,
            cwd,
        })
    }
}

type Captured = Result<(String, bool), String>;

fn captured(result: Option<Captured>, reader: mpsc::Receiver<Captured>) -> Captured {
    result
        .or_else(|| reader.recv_timeout(Duration::from_millis(250)).ok())
        .unwrap_or_else(|| Ok((String::new(), true)))
}

fn capture(mut pipe: impl Read + Send + 'static, redactor: Redactor) -> mpsc::Receiver<Captured> {
    let (send, receive) = mpsc::sync_channel(1);
    std::thread::spawn(move || {
        let mut bytes = Vec::new();
        let mut block = [0; 8192];
        let mut truncated = false;
        let result = loop {
            match pipe.read(&mut block) {
                Ok(0) => break Ok(()),
                Ok(count) => {
                    let keep = count.min(OUTPUT_LIMIT - bytes.len());
                    bytes.extend_from_slice(&block[..keep]);
                    truncated |= keep < count;
                }
                Err(error) if error.kind() == std::io::ErrorKind::Interrupted => continue,
                Err(_) => break Err("Could not read app run output.".to_string()),
            }
        };
        block.zeroize();
        let output = result.map(|()| {
            let text = String::from_utf8_lossy(&bytes);
            let mut output = if truncated {
                // The cap can bisect a secret. Keep only the stream's fully matched prefix.
                StreamRedactor::default().push(&redactor, &text)
            } else {
                redactor.text(&text)
            };
            if output.len() > OUTPUT_LIMIT {
                output.truncate(output.floor_char_boundary(OUTPUT_LIMIT));
                truncated = true;
            }
            output
        });
        bytes.zeroize();
        let _ = send.send(output.map(|output| (output, truncated)));
    });
    receive
}
