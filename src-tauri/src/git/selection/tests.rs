use super::*;

use crate::git::command::git_stdout;
use crate::test_support::{git, init_git, init_git_commit, tmp};

#[test]
fn selected_files_work_without_a_head() {
    let repo = tmp("selected-unborn");
    assert!(init_git(&repo.0, "main", None));
    std::fs::write(repo.0.join("chosen.txt"), "chosen\n").unwrap();
    std::fs::write(repo.0.join("other.txt"), "other\n").unwrap();
    assert!(git(&repo.0, &["add", "other.txt"]));
    let paths = vec!["chosen.txt".into()];
    assert!(git_selected_context_for(&repo.0, &paths)
        .unwrap()
        .patch
        .contains("+chosen"));
    git_commit_selected_for(&repo.0, "First selected commit", &paths).unwrap();
    assert_eq!(
        git_stdout(&repo.0, &["ls-tree", "--name-only", "HEAD"]).as_deref(),
        Some("chosen.txt")
    );
    assert_eq!(
        git_stdout(&repo.0, &["diff", "--cached", "--name-only"]).as_deref(),
        Some("other.txt")
    );
}

#[test]
fn selected_paths_reject_directories_and_other_repositories_before_staging() {
    let repo = tmp("selected-invalid");
    assert!(init_git_commit(&repo.0, &[("chosen.txt", "old\n")]));
    let nested = repo.0.join("nested");
    std::fs::create_dir(&nested).unwrap();
    assert!(init_git_commit(&nested, &[("file.txt", "nested\n")]));
    std::fs::create_dir(repo.0.join("missing-folder")).unwrap();
    std::fs::write(repo.0.join("missing-folder/child.txt"), "child\n").unwrap();
    assert!(git(&repo.0, &["add", "missing-folder/child.txt"]));
    std::fs::remove_dir_all(repo.0.join("missing-folder")).unwrap();
    std::fs::write(repo.0.join("chosen.txt"), "unstaged\n").unwrap();
    let index = std::fs::read(repo.0.join(".git/index")).unwrap();
    for invalid in [
        "",
        "../escape",
        ".git/config",
        "./chosen.txt",
        "nested/file.txt",
        "missing-folder",
        "absent.txt",
    ] {
        let paths = vec!["chosen.txt".into(), invalid.into()];
        assert!(
            git_commit_selected_for(&repo.0, "Invalid", &paths).is_err(),
            "{invalid}"
        );
        assert!(
            git_selected_context_for(&repo.0, &paths).is_err(),
            "{invalid}"
        );
        assert_eq!(std::fs::read(repo.0.join(".git/index")).unwrap(), index);
    }
    assert!(git_commit_selected_for(&repo.0, "Empty", &[]).is_err());
}

#[cfg(unix)]
#[test]
fn selected_symlinks_do_not_read_or_commit_outside_files() {
    use std::os::unix::fs::symlink;
    let repo = tmp("selected-symlinks");
    let outside = tmp("selected-outside");
    assert!(init_git_commit(&repo.0, &[("chosen.txt", "old\n")]));
    std::fs::write(outside.0.join("secret.txt"), "OUTSIDE_SECRET\n").unwrap();
    symlink(outside.0.join("secret.txt"), repo.0.join("file-link")).unwrap();
    symlink(&outside.0, repo.0.join("dir-link")).unwrap();
    let context = git_selected_context_for(&repo.0, &["file-link".into()]).unwrap();
    assert!(!context.patch.contains("OUTSIDE_SECRET"));
    assert!(context.patch.contains("new file mode 120000"));
    assert!(git_selected_context_for(&repo.0, &["dir-link/secret.txt".into()]).is_err());
    assert!(git_commit_selected_for(&repo.0, "Escape", &["dir-link/secret.txt".into()]).is_err());
}
