use super::*;

use crate::git::snapshot::git_snapshot_for;
use crate::test_support::{git, init_git, tmp};

#[test]
fn git_range_diff_compares_against_a_fixed_base() {
    let dir = tmp("git-range-diff");
    if !init_git(&dir.0, "main", None) {
        return;
    }
    std::fs::write(dir.0.join("a.txt"), "one").unwrap();
    assert!(git(&dir.0, &["add", "."]) && git(&dir.0, &["commit", "-m", "init"]));
    let base = git_snapshot_for(&dir.0).unwrap().head;

    let empty = git_range_diff_for(&dir.0, &base).unwrap();
    std::fs::write(dir.0.join("a.txt"), "two").unwrap();
    assert!(git(&dir.0, &["commit", "-am", "feat: change a"]));
    let changed = git_range_diff_for(&dir.0, &base).unwrap();

    assert!(empty.diff_patch.is_empty());
    assert!(changed.commit_summary.contains("feat: change a"));
    assert!(changed.diff_patch.contains("+two"));
    assert!(git_range_diff_for(&dir.0, "--output=/tmp/x").is_err());
    assert!(git_range_diff_for(&dir.0, "0000000000000000000000000000000000000000").is_err());
}
