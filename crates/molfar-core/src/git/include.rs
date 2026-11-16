//! Seed a new worktree with the ignored files a repository opts into through
//! `.worktreeinclude` (gitignore syntax), such as installed dependencies.
use super::git;
use std::path::{Component, Path};
use std::process::Command;

const INCLUDE_FILE: &str = ".worktreeinclude";

/// Copy every path that `.worktreeinclude` matches and git ignores from `main` into `tree`.
/// Failures are logged and skipped: a missing dependency must never block a new checkout.
pub(crate) fn seed(main: &Path, tree: &Path) -> Vec<String> {
    if !main.join(INCLUDE_FILE).is_file() {
        return Vec::new();
    }

    let entries = match candidates(main) {
        Ok(entries) => entries,
        Err(error) => {
            eprintln!(
                "worktree include: listing {} failed: {error}",
                main.display()
            );
            return Vec::new();
        }
    };

    let mut copied = Vec::new();
    for entry in entries {
        match copy(main, tree, &entry) {
            Ok(true) => copied.push(entry),
            Ok(false) => {}
            Err(error) => eprintln!(
                "worktree include: copying {entry} into {} failed: {error}",
                tree.display()
            ),
        }
    }
    copied
}

fn candidates(main: &Path) -> Result<Vec<String>, String> {
    let list = |exclude: &str| -> Result<Vec<String>, String> {
        let output = git(
            main,
            &[
                "ls-files",
                "-z",
                "--others",
                "--ignored",
                "--directory",
                exclude,
            ],
        )?;
        Ok(output
            .split('\0')
            .filter(|entry| !entry.is_empty())
            .map(str::to_owned)
            .collect())
    };

    let ignored = list("--exclude-standard")?;
    let included = list(&format!("--exclude-from={INCLUDE_FILE}"))?;
    Ok(intersect(&ignored, &included))
}

/// `--directory` collapses a fully matched folder into one `dir/` entry, so the two
/// listings can disagree on depth. Keep the deeper entry whenever one contains the other.
fn intersect(ignored: &[String], included: &[String]) -> Vec<String> {
    let mut result: Vec<String> = Vec::new();
    for entry in included {
        if ignored.iter().any(|parent| contains(parent, entry)) {
            result.push(entry.clone());
            continue;
        }

        result.extend(
            ignored
                .iter()
                .filter(|child| contains(entry, child))
                .cloned(),
        );
    }

    result.sort();
    result.dedup();
    result
}

fn contains(parent: &str, child: &str) -> bool {
    parent == child || (parent.ends_with('/') && child.starts_with(parent))
}

fn safe(entry: &str) -> bool {
    Path::new(entry)
        .components()
        .all(|part| matches!(part, Component::Normal(_)))
}

fn copy(main: &Path, tree: &Path, entry: &str) -> Result<bool, String> {
    let relative = entry.trim_end_matches('/');
    if relative.is_empty() || !safe(relative) {
        return Err("path escapes the checkout".into());
    }

    let source = main.join(relative);
    let target = tree.join(relative);
    if target.symlink_metadata().is_ok() {
        return Ok(false);
    }
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let Err(error) = clone(&source, &target) else {
        return Ok(true);
    };
    eprintln!(
        "worktree include: cloning {} failed, copying instead: {error}",
        source.display()
    );

    remove_partial(&target)?;
    run_cp(&["-R"], &source, &target)?;
    Ok(true)
}

/// One `clonefile(2)` call clones a whole directory tree copy-on-write on APFS,
/// about ten times faster than `cp -c`, which clones file by file.
#[cfg(target_os = "macos")]
fn clone(source: &Path, target: &Path) -> Result<(), String> {
    use std::os::unix::ffi::OsStrExt;

    const CLONE_NOFOLLOW: u32 = 0x0001;
    let path = |path: &Path| {
        std::ffi::CString::new(path.as_os_str().as_bytes()).map_err(|error| error.to_string())
    };
    let (source, target) = (path(source)?, path(target)?);

    // SAFETY: both pointers come from live NUL-terminated CStrings for the call's duration.
    let status = unsafe { libc::clonefile(source.as_ptr(), target.as_ptr(), CLONE_NOFOLLOW) };
    if status == 0 {
        return Ok(());
    }
    Err(std::io::Error::last_os_error().to_string())
}

#[cfg(not(target_os = "macos"))]
fn clone(source: &Path, target: &Path) -> Result<(), String> {
    run_cp(&["-R", "--reflink=auto"], source, target)
}

fn run_cp(flags: &[&str], source: &Path, target: &Path) -> Result<(), String> {
    let output = Command::new("cp")
        .args(flags)
        .arg("--")
        .arg(source)
        .arg(target)
        .output()
        .map_err(|error| error.to_string())?;
    if output.status.success() {
        return Ok(());
    }
    Err(String::from_utf8_lossy(&output.stderr).trim().to_owned())
}

/// Only called for a target that did not exist before this copy started.
fn remove_partial(target: &Path) -> Result<(), String> {
    let Ok(meta) = target.symlink_metadata() else {
        return Ok(());
    };
    let removed = if meta.is_dir() {
        std::fs::remove_dir_all(target)
    } else {
        std::fs::remove_file(target)
    };
    removed.map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests;
