use std::io::ErrorKind;
use std::path::Path;
use std::process::Command;

use super::shell;

pub(super) struct Captured {
    pub stdout: String,
    pub stderr: String,
    pub ok: bool,
}

pub(super) trait Cli {
    fn run(&mut self, program: &str, args: &[String]) -> Result<Captured, String>;
}

pub(super) struct Process<'a> {
    pub root: &'a Path,
}

impl Cli for Process<'_> {
    fn run(&mut self, program: &str, args: &[String]) -> Result<Captured, String> {
        let binary = shell::resolve_gui_binary(program).ok_or_else(|| missing(program))?;
        let mut cmd = Command::new(&binary);
        cmd.current_dir(self.root)
            .args(args)
            .env("GIT_TERMINAL_PROMPT", "0");
        if program == "gh" {
            cmd.env("GH_PROMPT_DISABLED", "1")
                .env("GH_PAGER", "cat")
                .env("GIT_PAGER", "cat");
        }
        shell::apply_gui_env(&mut cmd);
        crate::process::configure_child(&mut cmd);
        let output = cmd.output().map_err(|error| {
            if error.kind() == ErrorKind::NotFound {
                missing(program)
            } else {
                error.to_string()
            }
        })?;
        Ok(Captured {
            stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
            stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
            ok: output.status.success(),
        })
    }
}

pub(super) fn missing(program: &str) -> String {
    match program {
        "gh" => "GitHub CLI (`gh`) is not installed.".into(),
        "glab" => "GitLab CLI (`glab`) is not installed.".into(),
        other => format!("{other} is not installed."),
    }
}

/// Auth listings. A missing binary is an empty list. `glab` is read even when
/// the check failed, because the host line is still there.
pub(super) fn auth_hosts(root: &Path, program: &str, args: &[&str], failed_ok: bool) -> String {
    let mut cli = Process { root };
    let owned: Vec<String> = args.iter().copied().map(str::to_owned).collect();
    match cli.run(program, &owned) {
        Ok(captured) if captured.ok || failed_ok => {
            format!("{}\n{}", captured.stdout, captured.stderr)
        }
        _ => String::new(),
    }
}
