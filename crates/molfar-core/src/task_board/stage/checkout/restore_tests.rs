use super::tests::{card, repository};
use crate::{
    git::git,
    task_board::{
        constants::{CODE_REVIEW, IMPLEMENT},
        types::Card,
    },
};
use std::path::Path;

fn retained(root: &Path, column: &str) -> (Card, super::types::RetainedCheckout) {
    let mut card = card(root);
    let tree = super::ensure_worktree(&card).unwrap();
    card.branch = Some(tree.branch.clone());
    card.worktree_path = Some(tree.path.clone());
    card.base_sha = Some(tree.base_sha.clone());
    card.base_ref = Some(tree.base_ref.clone());
    card.column_id = column.into();
    (card, tree)
}

fn commit(tree: &str) -> String {
    std::fs::write(Path::new(tree).join("file"), "work\n").unwrap();
    git(Path::new(tree), &["add", "file"]).unwrap();
    git(
        Path::new(tree),
        &[
            "-c",
            "user.name=Fixture",
            "-c",
            "user.email=fixture@example.invalid",
            "-c",
            "commit.gpgsign=false",
            "commit",
            "-m",
            "Work",
        ],
    )
    .unwrap();
    git(Path::new(tree), &["rev-parse", "HEAD"])
        .unwrap()
        .trim()
        .into()
}

#[test]
fn removed_directory_reattaches_the_surviving_branch_with_its_commits() {
    let directory = tempfile::tempdir().unwrap();
    repository(directory.path());
    let (card, tree) = retained(directory.path(), CODE_REVIEW);
    let head = commit(&tree.path);
    std::fs::remove_dir_all(&tree.path).unwrap();

    let restored = super::ensure_worktree(&card).unwrap();

    assert_eq!(restored, tree);
    let restored_head = git(Path::new(&restored.path), &["rev-parse", "HEAD"]).unwrap();
    assert_eq!(restored_head.trim(), head);
}

#[test]
fn removed_directory_and_branch_restart_implement_from_the_recorded_base() {
    let directory = tempfile::tempdir().unwrap();
    repository(directory.path());
    let (card, tree) = retained(directory.path(), IMPLEMENT);
    git(
        directory.path(),
        &["worktree", "remove", "--force", &tree.path],
    )
    .unwrap();
    git(directory.path(), &["branch", "-D", &tree.branch]).unwrap();

    let restored = super::ensure_worktree(&card).unwrap();

    assert_eq!(restored, tree);
    let head = git(Path::new(&restored.path), &["rev-parse", "HEAD"]).unwrap();
    assert_eq!(head.trim(), tree.base_sha);
}

#[test]
fn review_refuses_to_invent_a_branch_that_was_removed() {
    let directory = tempfile::tempdir().unwrap();
    repository(directory.path());
    let (card, tree) = retained(directory.path(), CODE_REVIEW);
    git(
        directory.path(),
        &["worktree", "remove", "--force", &tree.path],
    )
    .unwrap();
    git(directory.path(), &["branch", "-D", &tree.branch]).unwrap();

    let error = super::ensure_worktree(&card).unwrap_err();

    assert!(error.contains("Plan approval"));
    assert!(!Path::new(&tree.path).exists());
}
