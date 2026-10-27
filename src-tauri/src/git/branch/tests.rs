use super::*;

use std::process::Command;

use crate::git::command::git_checked;
use crate::git::commit::git_commit_for;
use crate::git::info::git_head_branch;
use crate::git::stash::git_stash_for;
use crate::test_support::{git, init_git, init_git_commit, tmp};

#[test]
fn git_branches_empty_outside_a_repo() {
    let dir = tmp("git-branches-none");
    std::fs::write(dir.0.join("notes.txt"), "hello\n").unwrap();
    assert_eq!(git_branches_for(&dir.0), GitBranches::default());
}

#[test]
fn git_branches_lists_unborn_head() {
    let dir = tmp("git-branches-unborn");
    if !init_git(&dir.0, "main", None) {
        return;
    }
    let listed = git_branches_for(&dir.0);
    assert_eq!(listed.current.as_deref(), Some("main"));
    assert!(!listed.detached);
    assert!(listed
        .branches
        .iter()
        .any(|branch| { branch.name == "main" && branch.current && branch.remote.is_none() }));
}

#[test]
fn git_create_and_checkout_branch() {
    let dir = tmp("git-branch-switch");
    if !init_git_commit(&dir.0, &[("a.txt", "alpha\n")]) {
        return;
    }
    assert_eq!(
        git_create_branch_for(&dir.0, "feat/picker").unwrap(),
        "feat/picker"
    );
    let listed = git_branches_for(&dir.0);
    assert_eq!(listed.current.as_deref(), Some("feat/picker"));
    assert_eq!(git_checkout_for(&dir.0, "main", None).unwrap(), "main");
    assert_eq!(git_head_branch(&dir.0).as_deref(), Some("main"));
    assert!(git_create_branch_for(&dir.0, "feat/picker").is_err());
    assert!(git_create_branch_for(&dir.0, "bad name").is_err());
    assert!(git_checkout_for(&dir.0, "missing", None).is_err());
}

#[test]
fn git_stash_lets_checkout_proceed() {
    let dir = tmp("git-stash-checkout");
    if !init_git_commit(&dir.0, &[("a.txt", "main\n")]) {
        return;
    }
    if git_create_branch_for(&dir.0, "feature").is_err() {
        return;
    }
    std::fs::write(dir.0.join("a.txt"), "feature\n").unwrap();
    if !git(&dir.0, &["add", "."]) || !git(&dir.0, &["commit", "-m", "feature"]) {
        return;
    }
    if git_checkout_for(&dir.0, "main", None).is_err() {
        return;
    }
    std::fs::write(dir.0.join("a.txt"), "dirty\n").unwrap();
    let err = git_checkout_for(&dir.0, "feature", None).unwrap_err();
    assert!(checkout_blocked_by_changes(&err), "{err}");
    git_stash_for(&dir.0, Some("wip")).unwrap();
    assert_eq!(
        git_checkout_for(&dir.0, "feature", None).unwrap(),
        "feature"
    );
    assert_eq!(
        std::fs::read_to_string(dir.0.join("a.txt")).unwrap(),
        "feature\n"
    );
}

#[test]
fn git_stash_includes_untracked_that_block_checkout() {
    let dir = tmp("git-stash-untracked");
    if !init_git_commit(&dir.0, &[("a.txt", "main\n")]) {
        return;
    }
    if git_create_branch_for(&dir.0, "feature").is_err() {
        return;
    }
    std::fs::write(dir.0.join("new.txt"), "on-feature\n").unwrap();
    if !git(&dir.0, &["add", "."]) || !git(&dir.0, &["commit", "-m", "add new"]) {
        return;
    }
    if git_checkout_for(&dir.0, "main", None).is_err() {
        return;
    }
    std::fs::write(dir.0.join("new.txt"), "untracked\n").unwrap();
    let err = git_checkout_for(&dir.0, "feature", None).unwrap_err();
    assert!(checkout_blocked_by_changes(&err), "{err}");
    git_stash_for(&dir.0, None).unwrap();
    assert_eq!(
        git_checkout_for(&dir.0, "feature", None).unwrap(),
        "feature"
    );
    assert_eq!(
        std::fs::read_to_string(dir.0.join("new.txt")).unwrap(),
        "on-feature\n"
    );
}

#[test]
fn git_commit_lets_checkout_proceed() {
    let dir = tmp("git-commit-checkout");
    if !init_git_commit(&dir.0, &[("a.txt", "main\n")]) {
        return;
    }
    if git_create_branch_for(&dir.0, "feature").is_err() {
        return;
    }
    std::fs::write(dir.0.join("a.txt"), "feature\n").unwrap();
    if !git(&dir.0, &["add", "."]) || !git(&dir.0, &["commit", "-m", "feature"]) {
        return;
    }
    if git_checkout_for(&dir.0, "main", None).is_err() {
        return;
    }
    std::fs::write(dir.0.join("a.txt"), "dirty\n").unwrap();
    git_checked(&dir.0, &["add", "-A", "--", "."]).unwrap();
    git_commit_for(&dir.0, "save dirty").unwrap();
    assert_eq!(
        git_checkout_for(&dir.0, "feature", None).unwrap(),
        "feature"
    );
    assert_eq!(
        std::fs::read_to_string(dir.0.join("a.txt")).unwrap(),
        "feature\n"
    );
}

#[test]
fn git_branches_lists_remote_only_branch() {
    let repo = tmp("git-branch-remote-repo");
    let origin = tmp("git-branch-remote-origin");
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
        || git_create_branch_for(&repo.0, "feature").is_err()
        || !git(&repo.0, &["push", "-u", "origin", "feature"])
        || git_checkout_for(&repo.0, "main", None).is_err()
        || !git(&repo.0, &["branch", "-D", "feature"])
    {
        return;
    }
    let listed = git_branches_for(&repo.0);
    assert_eq!(listed.current.as_deref(), Some("main"));
    let remote = listed
        .branches
        .iter()
        .find(|branch| branch.name == "feature")
        .unwrap();
    assert_eq!(remote.remote.as_deref(), Some("origin"));
    assert!(!listed
        .branches
        .iter()
        .any(|branch| branch.name == "main" && branch.remote.is_some()));
    assert_eq!(
        git_checkout_for(&repo.0, "feature", Some("origin")).unwrap(),
        "feature"
    );
    assert_eq!(git_head_branch(&repo.0).as_deref(), Some("feature"));
}

#[test]
fn checkout_rejects_unknown_explicit_remote() {
    let dir = tmp("git-checkout-remote");
    if !init_git_commit(&dir.0, &[("a.txt", "alpha\n")]) {
        return;
    }
    let err = git_checkout_for(&dir.0, "main", Some("upstream")).unwrap_err();
    assert!(err.contains("Remote upstream not found"));
}
