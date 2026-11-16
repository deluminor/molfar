use super::*;

use std::process::Command;

use crate::git::commit::git_commit_for;
use crate::git::index::git_diff_index_for;
use crate::git::stage::git_stage_file_for;
use crate::test_support::{git, init_git_commit, tmp};

#[test]
fn git_sync_pulls_then_pushes() {
    let origin = tmp("git-sync-origin");
    let a = tmp("git-sync-a");
    let b = tmp("git-sync-b");
    if !init_git_commit(&a.0, &[("a.txt", "alpha\n")]) {
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
    if !git(&a.0, &["remote", "add", "origin", &origin_url])
        || !git(&a.0, &["push", "-u", "origin", "main"])
        || !git(&origin.0, &["symbolic-ref", "HEAD", "refs/heads/main"])
        || Command::new("git")
            .args(["clone", "-b", "main", &origin_url, "."])
            .current_dir(&b.0)
            .status()
            .map(|status| !status.success())
            .unwrap_or(true)
        || !git(&b.0, &["config", "user.name", "MOLFAR"])
        || !git(&b.0, &["config", "user.email", "molfar@test"])
        || !git(&b.0, &["config", "commit.gpgsign", "false"])
        || !git(&b.0, &["config", "core.autocrlf", "false"])
        || !git(&b.0, &["checkout", "--", "."])
    {
        return;
    }

    std::fs::write(a.0.join("a.txt"), "beta\n").unwrap();
    git_stage_file_for(&a.0, "a.txt").unwrap();
    git_commit_for(&a.0, "from-a").unwrap();
    git_sync_changes_for(&a.0).unwrap();

    git_sync_changes_for(&b.0).unwrap();
    assert_eq!(
        std::fs::read_to_string(b.0.join("a.txt")).unwrap(),
        "beta\n"
    );
    assert_eq!(git_diff_index_for(&b.0).ahead, 0);
    assert_eq!(git_diff_index_for(&b.0).behind, 0);

    std::fs::write(b.0.join("b.txt"), "from-b\n").unwrap();
    git_stage_file_for(&b.0, "b.txt").unwrap();
    git_commit_for(&b.0, "from-b").unwrap();
    std::fs::write(a.0.join("c.txt"), "from-a-again\n").unwrap();
    git_stage_file_for(&a.0, "c.txt").unwrap();
    git_commit_for(&a.0, "from-a-again").unwrap();
    git_sync_changes_for(&a.0).unwrap();
    git_sync_changes_for(&b.0).unwrap();
    assert!(b.0.join("c.txt").exists());
    git_sync_changes_for(&a.0).unwrap();
    assert!(a.0.join("b.txt").exists());
}
