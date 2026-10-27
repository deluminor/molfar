use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

static TMP_SEQ: AtomicU64 = AtomicU64::new(0);

pub(crate) struct Tmp(pub(crate) PathBuf);
impl Drop for Tmp {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

pub(crate) fn tmp(label: &str) -> Tmp {
    loop {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let seq = TMP_SEQ.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!(
            "molfar-{label}-{}-{stamp}-{seq}",
            std::process::id()
        ));
        match std::fs::create_dir(&dir) {
            Ok(()) => return Tmp(dir),
            Err(error) if error.kind() == ErrorKind::AlreadyExists => continue,
            Err(error) => panic!("{}", error),
        }
    }
}

pub(crate) fn init_git(dir: &Path, branch: &str, origin: Option<&str>) -> bool {
    let init = Command::new("git").args(["init"]).current_dir(dir).output();
    let Ok(init) = init else { return false };
    if !init.status.success() {
        return false;
    }
    let head = Command::new("git")
        .args(["symbolic-ref", "HEAD", &format!("refs/heads/{branch}")])
        .current_dir(dir)
        .status();
    if head.map(|status| !status.success()).unwrap_or(true) {
        return false;
    }
    if let Some(url) = origin {
        let remote = Command::new("git")
            .args(["remote", "add", "origin", url])
            .current_dir(dir)
            .status();
        if remote.map(|status| !status.success()).unwrap_or(true) {
            return false;
        }
    }
    git(dir, &["config", "user.name", "MOLFAR"])
        && git(dir, &["config", "user.email", "molfar@test"])
        && git(dir, &["config", "commit.gpgsign", "false"])
        && git(dir, &["config", "core.autocrlf", "false"])
}

pub(crate) fn git(dir: &Path, args: &[&str]) -> bool {
    Command::new("git")
        .args([
            "-c",
            "user.name=MOLFAR",
            "-c",
            "user.email=molfar@test",
            "-c",
            "commit.gpgsign=false",
        ])
        .args(args)
        .current_dir(dir)
        .env("GIT_AUTHOR_NAME", "MOLFAR")
        .env("GIT_AUTHOR_EMAIL", "molfar@test")
        .env("GIT_COMMITTER_NAME", "MOLFAR")
        .env("GIT_COMMITTER_EMAIL", "molfar@test")
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

pub(crate) fn init_git_commit(dir: &Path, files: &[(&str, &str)]) -> bool {
    if !init_git(dir, "main", None) {
        return false;
    }
    for (name, contents) in files {
        if std::fs::write(dir.join(name), contents).is_err() {
            return false;
        }
    }
    git(dir, &["add", "."]) && git(dir, &["commit", "-m", "init"])
}
