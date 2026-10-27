use super::*;

use crate::git::stage::git_stage_contents_for;
use crate::test_support::{git, init_git_commit, tmp};

#[test]
fn git_file_diff_returns_both_sides() {
    let dir = tmp("git-file-diff");
    if !init_git_commit(&dir.0, &[("a.txt", "alpha\nbeta\ngamma\n")]) {
        return;
    }
    std::fs::write(dir.0.join("a.txt"), "alpha\ngamma\ndelta\n").unwrap();

    let diff = git_file_diff_for(&dir.0, "a.txt", false).unwrap();
    assert_eq!(diff.status, "modified");
    assert_eq!(diff.original, "alpha\nbeta\ngamma\n");
    assert_eq!(diff.current, "alpha\ngamma\ndelta\n");
    assert!(!diff.binary);
    assert!(!diff.too_large);
}

#[test]
fn git_file_diff_staged_handles_additions_and_deletions() {
    let dir = tmp("git-file-diff-staged-status");
    if !init_git_commit(&dir.0, &[("gone.txt", "old\n")]) {
        return;
    }
    std::fs::write(dir.0.join("new.txt"), "new\n").unwrap();
    std::fs::remove_file(dir.0.join("gone.txt")).unwrap();
    assert!(git(&dir.0, &["add", "-A"]));

    let added = git_file_diff_for(&dir.0, "new.txt", true).unwrap();
    assert_eq!(added.status, "added");
    assert_eq!(added.original, "");
    assert_eq!(added.current, "new\n");

    let deleted = git_file_diff_for(&dir.0, "gone.txt", true).unwrap();
    assert_eq!(deleted.status, "deleted");
    assert_eq!(deleted.original, "old\n");
    assert_eq!(deleted.current, "");
}

#[test]
fn git_file_diff_separates_staged_and_unstaged_changes() {
    let dir = tmp("git-file-diff-partial");
    if !init_git_commit(&dir.0, &[("a.txt", "alpha\nbeta\ngamma\ndelta\n")]) {
        return;
    }
    std::fs::write(dir.0.join("a.txt"), "alpha\nBETA\ngamma\nDELTA\n").unwrap();
    git_stage_contents_for(&dir.0, "a.txt", b"alpha\nBETA\ngamma\ndelta\n").unwrap();

    let staged = git_file_diff_for(&dir.0, "a.txt", true).unwrap();
    assert_eq!(staged.original, "alpha\nbeta\ngamma\ndelta\n");
    assert_eq!(staged.current, "alpha\nBETA\ngamma\ndelta\n");

    let unstaged = git_file_diff_for(&dir.0, "a.txt", false).unwrap();
    assert_eq!(unstaged.original, "alpha\nBETA\ngamma\ndelta\n");
    assert_eq!(unstaged.current, "alpha\nBETA\ngamma\nDELTA\n");
}

#[test]
fn git_file_diff_untracked_has_empty_original() {
    let dir = tmp("git-file-diff-new");
    if !init_git_commit(&dir.0, &[("a.txt", "alpha\n")]) {
        return;
    }
    std::fs::write(dir.0.join("new.txt"), "hello\n").unwrap();

    let diff = git_file_diff_for(&dir.0, "new.txt", false).unwrap();
    assert_eq!(diff.status, "untracked");
    assert_eq!(diff.original, "");
    assert_eq!(diff.current, "hello\n");
}

#[test]
fn git_file_diff_deleted_has_empty_current() {
    let dir = tmp("git-file-diff-del");
    if !init_git_commit(&dir.0, &[("a.txt", "alpha\n")]) {
        return;
    }
    std::fs::remove_file(dir.0.join("a.txt")).unwrap();

    let diff = git_file_diff_for(&dir.0, "a.txt", false).unwrap();
    assert_eq!(diff.status, "deleted");
    assert_eq!(diff.original, "alpha\n");
    assert_eq!(diff.current, "");
}

#[test]
fn git_file_diff_rejects_path_escape() {
    let dir = tmp("git-file-diff-escape");
    assert!(git_file_diff_for(&dir.0, "../secret.txt", false).is_err());
}

#[test]
fn git_file_diff_rejects_outside_a_repo() {
    let dir = tmp("git-file-diff-none");
    std::fs::write(dir.0.join("notes.txt"), "hello\n").unwrap();
    assert!(git_file_diff_for(&dir.0, "notes.txt", false).is_err());
}
