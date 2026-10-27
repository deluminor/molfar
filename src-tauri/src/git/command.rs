use std::path::Path;
use std::process::Command;

use crate::git::numstat::normalize_diff_path;

pub(crate) fn resolve_repo_path(root: &Path, relative: &str) -> Result<String, String> {
    let relative = normalize_diff_path(relative);
    if relative.is_empty()
        || relative.starts_with('/')
        || relative
            .split('/')
            .any(|part| part.is_empty() || part == "..")
    {
        return Err("Invalid path".into());
    }
    let abs = root.join(&relative);
    if !abs.starts_with(root) {
        return Err("Invalid path".into());
    }
    Ok(relative)
}

/// Repository overrides a parent git (a hook, a terminal `exec`) may export;
/// inherited, they would point every command at that repository instead.
const INHERITED_REPO_ENV: [&str; 4] = [
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_COMMON_DIR",
    "GIT_INDEX_FILE",
];

/// Any git can start a filter: in an LFS repo `status`, `diff`, `add`, and
/// checkouts all run `git-lfs`, which a Finder launch's bare PATH lacks. The
/// cached search path finds it without waiting on the login shell.
fn base_command() -> Command {
    let mut cmd = Command::new("git");
    crate::hide_window_console(&mut cmd);
    cmd.env("PATH", crate::harness::cached_gui_search_path());
    for name in INHERITED_REPO_ENV {
        cmd.env_remove(name);
    }
    cmd
}

/// `git --no-pager -C <root>` with prompts and optional locks off.
pub(crate) fn command(root: &Path) -> Command {
    let mut cmd = base_command();
    cmd.arg("--no-pager")
        .arg("-C")
        .arg(root)
        .env("GIT_OPTIONAL_LOCKS", "0")
        .env("GIT_TERMINAL_PROMPT", "0");
    cmd
}

/// [`command`] at background priority, for the app's own status/diff reads.
pub(super) fn git_cmd(root: &Path) -> Command {
    let mut cmd = command(root);
    crate::background_work::configure_child(&mut cmd);
    cmd
}

fn with_login_path(mut cmd: Command, args: &[&str], gui_path: impl FnOnce() -> String) -> Command {
    let args = args.strip_prefix(&["--literal-pathspecs"]).unwrap_or(args);
    if matches!(
        args.first().copied(),
        Some("commit" | "push" | "pull" | "fetch" | "clone")
    ) {
        // Signers, hooks, and credential helpers may only be on the login-shell PATH.
        cmd.env("PATH", gui_path());
    }
    cmd
}

pub(super) fn git_cmd_for_args(root: &Path, args: &[&str]) -> Command {
    with_login_path(git_cmd(root), args, crate::harness::gui_search_path)
}

/// `git clone` has no repository yet, so it runs without `-C`.
pub(super) fn clone_command() -> Command {
    let mut cmd = base_command();
    crate::background_work::configure_child(&mut cmd);
    with_login_path(cmd, &["clone"], crate::harness::gui_search_path)
}

pub(crate) fn git_checked(root: &Path, args: &[&str]) -> Result<(), String> {
    let output = git_cmd_for_args(root, args)
        .args(args)
        .output()
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        return Ok(());
    }
    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    let msg = stderr.trim();
    if !msg.is_empty() {
        return Err(msg.to_string());
    }
    let msg = stdout.trim();
    if !msg.is_empty() {
        return Err(msg.to_string());
    }
    Err(format!("git {} failed", args.join(" ")))
}

pub(super) fn git_blob(root: &Path, spec: &str) -> Option<Vec<u8>> {
    git_output(root, &["cat-file", "-p", spec])
}

pub(super) fn git_run(root: &Path, args: &[&str]) -> Option<String> {
    git_output(root, args).map(|bytes| String::from_utf8_lossy(&bytes).into_owned())
}

pub(super) fn git_output(root: &Path, args: &[&str]) -> Option<Vec<u8>> {
    let output = git_cmd_for_args(root, args).args(args).output().ok()?;
    if git_status_ok(&output.status, args) {
        return Some(output.stdout);
    }
    None
}

pub(super) fn git_status_ok(status: &std::process::ExitStatus, args: &[&str]) -> bool {
    status.success()
        || (status.code() == Some(1) && matches!(args.first().copied(), Some("diff" | "grep")))
}

pub(crate) fn git_stdout(root: &Path, args: &[&str]) -> Option<String> {
    let output = git_cmd(root).args(args).output().ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if text.is_empty() {
        None
    } else {
        Some(text)
    }
}

#[cfg(test)]
mod tests;
