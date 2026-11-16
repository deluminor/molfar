use super::*;

use crate::test_support::{init_git_commit, tmp};

#[test]
fn git_diff_stats_are_zero_outside_a_repo() {
    let dir = tmp("git-diff-none");
    std::fs::write(dir.0.join("notes.txt"), "hello\n").unwrap();
    assert_eq!(
        git_diff_stats_for(&dir.0),
        GitDiffStats {
            files: 0,
            additions: 0,
            deletions: 0
        }
    );
}

#[test]
fn git_diff_stats_count_unstaged_and_untracked() {
    let dir = tmp("git-diff-dirty");
    if !init_git_commit(&dir.0, &[("a.txt", "alpha\nbeta\ngamma\n")]) {
        return;
    }
    std::fs::write(dir.0.join("a.txt"), "alpha\ngamma\ndelta\n").unwrap();
    std::fs::write(dir.0.join("new.txt"), "hello\nworld\n").unwrap();
    std::fs::write(dir.0.join("ignored.txt"), "nope\n").unwrap();
    std::fs::write(dir.0.join(".gitignore"), "ignored.txt\n").unwrap();

    let stats = git_diff_stats_for(&dir.0);
    // a.txt: -beta +delta; new.txt: +2; .gitignore: +1 untracked
    assert_eq!(stats.files, 3);
    assert_eq!(stats.additions, 4);
    assert_eq!(stats.deletions, 1);
}

#[test]
fn git_diff_stats_are_zero_when_clean() {
    let dir = tmp("git-diff-clean");
    if !init_git_commit(&dir.0, &[("a.txt", "alpha\n")]) {
        return;
    }
    assert_eq!(
        git_diff_stats_for(&dir.0),
        GitDiffStats {
            files: 0,
            additions: 0,
            deletions: 0
        }
    );
}
