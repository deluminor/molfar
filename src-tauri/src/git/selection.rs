use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use uuid::Uuid;

use crate::fs::path_to_js;
use crate::git::command::{git_checked, git_cmd, git_output, git_stdout};
use crate::git::commit::{git_locate_file, with_signing_hint, GitStagedContext};
use crate::git::info::git_branch;

/// A selection names literal files in exactly one checkout, never a directory
/// or a pathspec that can widen the commit to other files or repositories.
fn git_selected_paths(root: &Path, paths: &[String]) -> Result<Vec<String>, String> {
    if paths.is_empty() {
        return Err("Select at least one file".into());
    }
    let canonical_root = std::fs::canonicalize(root).map_err(|e| e.to_string())?;
    let mut selected = Vec::new();
    for path in paths {
        let relative = path_to_js(Path::new(path));
        if relative.contains('\0')
            || Path::new(&relative).is_absolute()
            || Path::new(&relative)
                .components()
                .any(|part| !matches!(part, std::path::Component::Normal(_)))
            || relative.split('/').any(|part| {
                part.is_empty() || matches!(part, "." | "..") || part.eq_ignore_ascii_case(".git")
            })
        {
            return Err("Invalid selected file path".into());
        }
        let target = canonical_root.join(&relative);
        let exists = match std::fs::symlink_metadata(&target) {
            Ok(entry) if entry.is_dir() => {
                return Err("Select files rather than directories".into())
            }
            Ok(_) => true,
            Err(error) if error.kind() == ErrorKind::NotFound => false,
            Err(error) => return Err(error.to_string()),
        };
        let location = git_locate_file(&canonical_root.join(&relative))?
            .ok_or("Selected file is outside Git")?;
        if std::fs::canonicalize(&location.root).map_err(|e| e.to_string())? != canonical_root {
            return Err("Selected files must belong to this repository".into());
        }
        let tracked = git_output(
            root,
            &["--literal-pathspecs", "ls-files", "-z", "--", &relative],
        )
        .ok_or("Could not validate selected files")?;
        if tracked
            .split(|byte| *byte == 0)
            .any(|entry| !entry.is_empty() && entry != relative.as_bytes())
        {
            return Err("Select files rather than directories".into());
        }
        let head_type = git_stdout(root, &["cat-file", "-t", &format!("HEAD:{relative}")]);
        if head_type.as_deref() == Some("tree") {
            return Err("Select files rather than directories".into());
        }
        if !exists && tracked.is_empty() && head_type.as_deref() != Some("blob") {
            return Err("Selected file does not exist in this repository".into());
        }
        if !selected.contains(&relative) {
            selected.push(relative);
        }
    }
    Ok(selected)
}

pub(super) fn git_commit_selected_for(
    root: &Path,
    message: &str,
    paths: &[String],
) -> Result<(), String> {
    if message.trim().is_empty() {
        return Err("Commit message cannot be empty".into());
    }
    let paths = git_selected_paths(root, paths)?;
    let existing: Vec<&str> = paths
        .iter()
        .filter(|path| std::fs::symlink_metadata(root.join(path)).is_ok())
        .map(String::as_str)
        .collect();
    let mut add = vec!["--literal-pathspecs", "add", "-A", "--"];
    add.extend(existing);
    if add.len() > 4 {
        git_checked(root, &add)?;
    }
    // --only takes the chosen working-tree files and preserves every other
    // staged entry. Add existing files to make new files eligible for --only;
    // already-staged deletions no longer match `git add` but do match `commit`.
    let mut args = vec![
        "--literal-pathspecs",
        "commit",
        "--only",
        "--cleanup=strip",
        "-m",
        message.trim(),
        "--",
    ];
    args.extend(paths.iter().map(String::as_str));
    git_checked(root, &args).map_err(with_signing_hint)
}

struct GitSelectionIndex(PathBuf);

impl Drop for GitSelectionIndex {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

pub(super) fn git_selected_context_for(
    root: &Path,
    paths: &[String],
) -> Result<GitStagedContext, String> {
    let paths = git_selected_paths(root, paths)?;
    let index_dir = std::env::temp_dir().join(format!("molfar-git-selection-{}", Uuid::new_v4()));
    let directory = std::fs::DirBuilder::new();
    #[cfg(unix)]
    let directory = {
        use std::os::unix::fs::DirBuilderExt;
        let mut directory = directory;
        directory.mode(0o700);
        directory
    };
    directory.create(&index_dir).map_err(|e| e.to_string())?;
    let index = GitSelectionIndex(index_dir);
    let run = |args: &[&str]| -> Result<String, String> {
        let output = git_cmd(root)
            .arg("--literal-pathspecs")
            .args(args)
            .env("GIT_INDEX_FILE", index.0.join("index"))
            .env("PATH", crate::harness::gui_search_path())
            .output()
            .map_err(|e| e.to_string())?;
        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).trim().into());
        }
        String::from_utf8(output.stdout).map_err(|e| e.to_string())
    };
    if git_stdout(root, &["rev-parse", "--verify", "HEAD"]).is_some() {
        run(&["read-tree", "HEAD"])?;
    } else {
        run(&["read-tree", "--empty"])?;
    }
    let mut add = vec!["add", "-A", "--"];
    add.extend(paths.iter().map(String::as_str));
    run(&add)?;
    Ok(GitStagedContext {
        branch: git_branch(root),
        summary: run(&["diff", "--cached", "--stat", "--no-renames"])?,
        patch: run(&[
            "diff",
            "--cached",
            "--no-ext-diff",
            "--no-textconv",
            "--no-renames",
        ])?,
    })
}

#[cfg(test)]
mod tests;
