use super::*;

use crate::test_support::{init_git, tmp};

#[test]
fn git_info_reads_branch_and_origin_repo() {
    let dir = tmp("git-info");
    if !init_git(
        &dir.0,
        "fix-sidebar",
        Some("https://github.com/acme/widget.git"),
    ) {
        return;
    }
    let info = git_info_for(&dir.0);
    assert_eq!(info.branch.as_deref(), Some("fix-sidebar"));
    assert_eq!(info.repo.as_deref(), Some("widget"));
}

#[test]
fn git_info_falls_back_to_folder_name_without_origin() {
    let dir = tmp("git-info-local");
    if !init_git(&dir.0, "main", None) {
        return;
    }
    let info = git_info_for(&dir.0);
    assert_eq!(info.branch.as_deref(), Some("main"));
    assert_eq!(
        info.repo.as_deref(),
        dir.0.file_name().and_then(|name| name.to_str())
    );
}
