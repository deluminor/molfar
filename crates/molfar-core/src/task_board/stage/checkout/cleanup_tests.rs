use super::tests::{card, repository};
use crate::{
    git::git,
    task_board::delivery::port::{DeliveryPort, GitDelivery},
};
use std::path::Path;

fn retained(root: &Path) -> (crate::task_board::types::Card, String, String) {
    let mut card = card(root);
    let tree = super::ensure_worktree(&card).unwrap();
    card.branch = Some(tree.branch.clone());
    card.worktree_path = Some(tree.path.clone());
    card.base_sha = Some(tree.base_sha.clone());
    card.base_ref = Some(tree.base_ref.clone());
    (card, tree.path, tree.branch)
}

fn branch_exists(root: &Path, branch: &str) -> bool {
    git(
        root,
        &[
            "show-ref",
            "--verify",
            "--quiet",
            &format!("refs/heads/{branch}"),
        ],
    )
    .is_ok()
}

#[test]
fn delivery_removal_keeps_dirty_tree_and_reject_removes_it() {
    let directory = tempfile::tempdir().unwrap();
    repository(directory.path());
    let (card, path, branch) = retained(directory.path());
    let port = GitDelivery;
    std::fs::write(Path::new(&path).join("draft"), "owner edit").unwrap();

    let refused = port.remove_worktree(directory.path(), Path::new(&path), false);

    assert!(refused.unwrap_err().contains("uncommitted"));
    assert!(Path::new(&path).join("draft").exists());
    assert_eq!(port.retained_worktree(&card).unwrap(), path);
    port.remove_worktree(directory.path(), Path::new(&path), true)
        .unwrap();
    assert!(!Path::new(&path).exists());
    assert!(branch_exists(directory.path(), &branch));
    assert!(port.retained_worktree(&card).is_err());
}

#[test]
fn clean_delivery_removal_keeps_the_branch() {
    let directory = tempfile::tempdir().unwrap();
    repository(directory.path());
    let (_card, path, branch) = retained(directory.path());

    GitDelivery
        .remove_worktree(directory.path(), Path::new(&path), false)
        .unwrap();

    assert!(!Path::new(&path).exists());
    assert!(branch_exists(directory.path(), &branch));
}

#[test]
fn task_branch_removal_keeps_pushed_attached_and_foreign_branches() {
    let directory = tempfile::tempdir().unwrap();
    let root = directory.path().join("repo");
    std::fs::create_dir(&root).unwrap();
    repository(&root);
    git(directory.path(), &["init", "--bare", "remote.git"]).unwrap();
    let remote = directory.path().join("remote.git");
    git(
        &root,
        &["remote", "add", "origin", remote.to_str().unwrap()],
    )
    .unwrap();
    let (_card, path, branch) = retained(&root);
    let port = GitDelivery;

    assert!(port
        .remove_task_branch(&root, "main")
        .unwrap_err()
        .contains("Only Task Board"));
    assert!(port
        .remove_task_branch(&root, &branch)
        .unwrap_err()
        .contains("worktree"));
    git(Path::new(&path), &["push", "-u", "origin", &branch]).unwrap();
    port.remove_worktree(&root, Path::new(&path), true).unwrap();

    assert!(!port.remove_task_branch(&root, &branch).unwrap());
    assert!(branch_exists(&root, &branch));
    git(&root, &["branch", "--unset-upstream", &branch]).unwrap();
    assert!(port.remove_task_branch(&root, &branch).unwrap());
    assert!(!branch_exists(&root, &branch));
    assert!(port.remove_task_branch(&root, &branch).unwrap());
}

#[test]
fn retained_worktree_refuses_missing_or_foreign_trees_without_recreating() {
    let directory = tempfile::tempdir().unwrap();
    repository(directory.path());
    let (mut card, path, _branch) = retained(directory.path());
    let port = GitDelivery;

    card.branch = Some("molfar/task-other".into());
    assert!(port.retained_worktree(&card).is_err());
    card.worktree_path = None;
    assert!(port
        .retained_worktree(&card)
        .unwrap_err()
        .contains("no worktree"));
    assert!(Path::new(&path).exists());
    assert_eq!(
        port.remotes(directory.path()).unwrap(),
        Vec::<String>::new()
    );
}
