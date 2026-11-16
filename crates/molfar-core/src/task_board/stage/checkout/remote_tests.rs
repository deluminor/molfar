use super::branch;
use crate::git::git;

#[test]
fn remote_default_remains_resolvable_without_a_local_default_branch() {
    let directory = tempfile::tempdir().unwrap();
    let root = directory.path();
    git(root, &["init", "-b", "feature"]).unwrap();
    std::fs::write(root.join("file"), "base").unwrap();
    git(root, &["add", "file"]).unwrap();
    git(
        root,
        &[
            "-c",
            "user.name=Fixture",
            "-c",
            "user.email=fixture@example.invalid",
            "-c",
            "commit.gpgsign=false",
            "commit",
            "-m",
            "Base",
        ],
    )
    .unwrap();
    git(
        root,
        &[
            "remote",
            "add",
            "origin",
            "https://example.invalid/repository",
        ],
    )
    .unwrap();
    git(root, &["update-ref", "refs/remotes/origin/main", "HEAD"]).unwrap();
    git(
        root,
        &[
            "symbolic-ref",
            "refs/remotes/origin/HEAD",
            "refs/remotes/origin/main",
        ],
    )
    .unwrap();
    let base = branch::default_base(root).unwrap();
    assert_eq!(base, "refs/remotes/origin/main");
    assert!(git(
        root,
        &["rev-parse", "--verify", &format!("{base}^{{commit}}")]
    )
    .is_ok());
    git(
        root,
        &["symbolic-ref", "--delete", "refs/remotes/origin/HEAD"],
    )
    .unwrap();
    assert_eq!(branch::default_base(root).unwrap(), base);
}
