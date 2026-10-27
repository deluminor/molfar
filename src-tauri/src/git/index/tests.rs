use super::*;

use std::process::Command;

use crate::fs::path_to_js;
use crate::git::commit::git_commit_for;
use crate::git::file_diff::git_file_diff_for;
use crate::git::stage::git_stage_file_for;
use crate::test_support::{git, init_git_commit, tmp};

#[test]
fn git_diff_index_lists_modified_and_untracked() {
    let dir = tmp("git-diff-index");
    if !init_git_commit(&dir.0, &[("a.txt", "alpha\nbeta\ngamma\n")]) {
        return;
    }
    std::fs::write(dir.0.join("a.txt"), "alpha\ngamma\ndelta\n").unwrap();
    std::fs::write(dir.0.join("new.txt"), "hello\nworld\n").unwrap();

    let index = git_diff_index_for(&dir.0);
    assert_eq!(index.branch.as_deref(), Some("main"));
    assert_eq!(index.files.len(), 2);

    let modified = index
        .files
        .iter()
        .find(|file| file.relative == "a.txt")
        .unwrap();
    assert_eq!(modified.status, "modified");
    assert_eq!(modified.additions, 1);
    assert_eq!(modified.deletions, 1);

    let untracked = index
        .files
        .iter()
        .find(|file| file.relative == "new.txt")
        .unwrap();
    assert_eq!(untracked.status, "untracked");
    assert_eq!(untracked.additions, 2);
    assert_eq!(untracked.deletions, 0);
}

#[test]
fn git_diff_index_keeps_literal_non_ascii_paths() {
    let dir = tmp("git-diff-quoted-path");
    if !init_git_commit(&dir.0, &[("한글.md", "before\n"), ("my file.txt", "one\n")]) {
        return;
    }
    // Default quoting would otherwise hand the Changes view a C-escaped name.
    assert!(git(&dir.0, &["config", "core.quotePath", "true"]));
    std::fs::write(dir.0.join("한글.md"), "before\nafter\n").unwrap();
    std::fs::write(dir.0.join("my file.txt"), "one\ntwo\n").unwrap();

    let index = git_diff_index_for(&dir.0);
    let hangul = index
        .files
        .iter()
        .find(|file| file.relative == "한글.md")
        .unwrap();
    assert_eq!(hangul.status, "modified");
    assert_eq!(hangul.additions, 1);
    assert!(hangul.unstaged);
    assert!(!hangul.relative.contains('\\'));

    let spaced = index
        .files
        .iter()
        .find(|file| file.relative == "my file.txt")
        .unwrap();
    assert_eq!(spaced.status, "modified");
    assert_eq!(spaced.additions, 1);

    let diff = git_file_diff_for(&dir.0, "한글.md", false).unwrap();
    assert_eq!(diff.relative, "한글.md");
    assert!(diff.current.contains("after"));
}

#[test]
fn git_diff_files_keep_paths_relative_to_nested_workspace() {
    let dir = tmp("git-diff-nested-workspace");
    let workspace = dir.0.join("sub");
    std::fs::create_dir_all(workspace.join("sub")).unwrap();
    assert!(init_git_commit(
        &dir.0,
        &[("sub/file.txt", "original\n"), ("sub/second.txt", "old\n")],
    ));
    std::fs::write(workspace.join("file.txt"), "staged\n").unwrap();
    assert!(git(&dir.0, &["add", "--", "sub/file.txt"]));
    std::fs::write(workspace.join("second.txt"), "unstaged\n").unwrap();
    // Without --relative this collides with the tracked sub/file.txt key.
    std::fs::write(workspace.join("sub/file.txt"), "untracked\n").unwrap();

    let changes = git_diff_files_for(&workspace);
    assert_eq!(changes.files.len(), 3);
    for (relative, staged, unstaged) in [
        ("file.txt", true, false),
        ("second.txt", false, true),
        ("sub/file.txt", false, true),
    ] {
        let file = changes
            .files
            .iter()
            .find(|file| file.relative == relative)
            .unwrap();
        assert_eq!(file.path, path_to_js(&workspace.join(relative)));
        assert_eq!((file.staged, file.unstaged), (staged, unstaged));
    }
    let staged = git_file_diff_for(&workspace, "file.txt", true).unwrap();
    assert_eq!(staged.original, "original\n");
    assert_eq!(staged.current, "staged\n");
}

#[test]
fn git_sync_marks_head_pushed_without_upstream() {
    let repo = tmp("git-pushed-repo");
    let origin = tmp("git-pushed-origin");
    if !init_git_commit(&repo.0, &[("a.txt", "alpha\n")]) {
        return;
    }
    if Command::new("git")
        .args(["init", "--bare"])
        .current_dir(&origin.0)
        .status()
        .map(|status| !status.success())
        .unwrap_or(true)
    {
        return;
    }
    let origin_url = origin.0.to_string_lossy().into_owned();
    if !git(&repo.0, &["remote", "add", "origin", &origin_url])
        || !git(&repo.0, &["push", "-u", "origin", "main"])
        || !git(&repo.0, &["checkout", "-b", "feature"])
    {
        return;
    }
    std::fs::write(repo.0.join("a.txt"), "beta\n").unwrap();
    git_stage_file_for(&repo.0, "a.txt").unwrap();
    git_commit_for(&repo.0, "feature work").unwrap();
    assert!(!git_diff_index_for(&repo.0).head_pushed);
    if !git(&repo.0, &["push", "origin", "feature"]) {
        return;
    }
    let index = git_diff_index_for(&repo.0);
    assert_eq!(index.upstream, None);
    assert!(index.head_pushed);
}
