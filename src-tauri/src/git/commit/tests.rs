use super::*;

use crate::git::stage::git_stage_file_for;
use crate::test_support::{git, init_git, init_git_commit, tmp};

#[test]
fn locate_files_distinguishes_repos_worktrees_and_deleted_parents() {
    let home = tmp("locate-files");
    let a = home.0.join("a");
    let b = home.0.join("b");
    std::fs::create_dir(&a).unwrap();
    std::fs::create_dir(&b).unwrap();
    assert!(init_git_commit(&a, &[("file.txt", "a\n")]));
    assert!(init_git_commit(&b, &[("file.txt", "b\n")]));
    let tree = home.0.join("worktree");
    assert!(git(
        &a,
        &["worktree", "add", "-b", "other", tree.to_str().unwrap()]
    ));
    for (root, relative) in [
        (&a, "deleted/folder/file.txt"),
        (&b, "file.txt"),
        (&tree, "file.txt"),
    ] {
        let canonical = std::fs::canonicalize(root).unwrap();
        let location = git_locate_file(&root.join(relative)).unwrap().unwrap();
        assert_eq!(std::fs::canonicalize(&location.root).unwrap(), canonical);
        assert_eq!(location.relative, relative);
    }
    assert_eq!(git_locate_file(&home.0.join("outside.txt")).unwrap(), None);
}

#[test]
fn git_commit_rejects_empty_message() {
    let dir = tmp("git-commit-empty");
    assert!(git_commit_for(&dir.0, "   ").is_err());
}

#[test]
fn git_head_message_returns_subject_and_body() {
    let dir = tmp("git-head-message");
    if !init_git_commit(&dir.0, &[("a.txt", "alpha\n")]) {
        return;
    }
    std::fs::write(dir.0.join("a.txt"), "beta\n").unwrap();
    git_stage_file_for(&dir.0, "a.txt").unwrap();
    git_commit_for(&dir.0, "Subject line\n\nBody text").unwrap();
    assert_eq!(
        git_head_message_for(&dir.0).unwrap(),
        "Subject line\n\nBody text"
    );
}

#[test]
fn git_head_message_fails_without_commits() {
    let dir = tmp("git-head-message-empty");
    if !init_git(&dir.0, "main", None) {
        return;
    }
    assert!(git_head_message_for(&dir.0).is_err());
}

#[test]
fn git_staged_context_falls_back_to_unstaged() {
    let dir = tmp("git-staged-unstaged");
    if !init_git_commit(&dir.0, &[("a.txt", "alpha\n")]) {
        return;
    }
    std::fs::write(dir.0.join("a.txt"), "gamma\n").unwrap();
    let context = git_staged_context_for(&dir.0).unwrap();
    assert!(context.patch.contains("gamma"));
}

#[test]
fn signing_hint_ignores_other_errors() {
    let error = "nothing to commit, working tree clean".to_string();
    assert_eq!(with_signing_hint(error.clone()), error);
}

#[test]
fn git_commit_reports_signing_failure_with_hint() {
    let dir = tmp("git-commit-signing");
    if !init_git_commit(&dir.0, &[("a.txt", "a\n")]) {
        return;
    }
    std::fs::write(dir.0.join("a.txt"), "b\n").unwrap();
    for args in [
        ["config", "commit.gpgsign", "true"],
        ["config", "gpg.format", "openpgp"],
        ["config", "gpg.program", "/nonexistent/molfar-gpg"],
    ] {
        assert!(git(&dir.0, &args));
    }
    assert!(git(&dir.0, &["add", "."]));
    let error = git_commit_for(&dir.0, "signed").unwrap_err();
    assert!(error.contains("Git couldn't sign this commit"), "{error}");
}
