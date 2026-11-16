use super::*;

use crate::fs::path_to_js;
use crate::git::history::git_history_for;
use crate::test_support::{git, init_git_commit, tmp};

#[test]
fn git_commit_diff_reads_parent_and_current() {
    let dir = tmp("git-commit-diff");
    if !init_git_commit(&dir.0, &[("a.txt", "alpha\n")]) {
        return;
    }
    std::fs::write(dir.0.join("a.txt"), "beta\n").unwrap();
    assert!(git(&dir.0, &["add", "."]));
    assert!(git(&dir.0, &["commit", "-m", "update a"]));
    let history = git_history_for(&dir.0, Some(1)).unwrap();
    let sha = &history.commits[0].sha;

    let files = git_commit_files_for(&dir.0, sha).unwrap();
    assert_eq!(files.len(), 1);
    assert_eq!(files[0].relative, "a.txt");
    assert_eq!(files[0].status, "modified");
    assert_eq!(files[0].path, path_to_js(&dir.0.join("a.txt")));

    let diff = git_commit_file_diff_for(&dir.0, sha, "a.txt").unwrap();
    assert_eq!(diff.original, "alpha\n");
    assert_eq!(diff.current, "beta\n");
    assert_eq!(diff.status, "modified");
    assert_eq!(diff.path, path_to_js(&dir.0.join("a.txt")));
}

#[test]
fn git_commit_diff_root_commit_is_added() {
    let dir = tmp("git-commit-root");
    if !init_git_commit(&dir.0, &[("a.txt", "alpha\n")]) {
        return;
    }
    let history = git_history_for(&dir.0, Some(1)).unwrap();
    let sha = &history.commits[0].sha;
    let files = git_commit_files_for(&dir.0, sha).unwrap();
    assert_eq!(files[0].status, "added");
    let diff = git_commit_file_diff_for(&dir.0, sha, "a.txt").unwrap();
    assert_eq!(diff.original, "");
    assert_eq!(diff.current, "alpha\n");
    assert_eq!(diff.status, "added");
}

#[test]
fn git_commit_diff_rejects_bad_sha_and_path() {
    let dir = tmp("git-commit-bad");
    if !init_git_commit(&dir.0, &[("a.txt", "alpha\n")]) {
        return;
    }
    assert!(git_commit_files_for(&dir.0, "../oops").is_err());
    assert!(git_commit_files_for(&dir.0, "not-hex!").is_err());
    let history = git_history_for(&dir.0, Some(1)).unwrap();
    let sha = &history.commits[0].sha;
    assert!(git_commit_file_diff_for(&dir.0, sha, "../secret.txt").is_err());
}
