use super::*;

use std::process::Command;

#[cfg(unix)]
use crate::git::command::git_run;
use crate::git::commit::{git_commit_for, git_staged_context_for};
use crate::git::file_diff::git_file_diff_for;
use crate::git::index::git_diff_index_for;
use crate::git::range::git_range_context_for;
use crate::test_support::{git, init_git_commit, tmp};

#[test]
fn git_file_diff_staged_reads_head_and_index() {
    let dir = tmp("git-file-diff-staged");
    if !init_git_commit(&dir.0, &[("a.txt", "alpha\n")]) {
        return;
    }
    std::fs::write(dir.0.join("a.txt"), "beta\n").unwrap();
    git_stage_file_for(&dir.0, "a.txt").unwrap();

    let diff = git_file_diff_for(&dir.0, "a.txt", true).unwrap();
    assert_eq!(diff.status, "modified");
    assert_eq!(diff.original, "alpha\n");
    assert_eq!(diff.current, "beta\n");
}

#[test]
fn git_stage_and_unstage_file() {
    let dir = tmp("git-stage");
    if !init_git_commit(&dir.0, &[("a.txt", "alpha\n")]) {
        return;
    }
    std::fs::write(dir.0.join("a.txt"), "beta\n").unwrap();
    git_stage_file_for(&dir.0, "a.txt").unwrap();
    let staged = git_diff_index_for(&dir.0)
        .files
        .into_iter()
        .find(|file| file.relative == "a.txt")
        .unwrap();
    assert!(staged.staged);
    assert!(!staged.unstaged);

    git_unstage_file_for(&dir.0, "a.txt").unwrap();
    let unstaged = git_diff_index_for(&dir.0)
        .files
        .into_iter()
        .find(|file| file.relative == "a.txt")
        .unwrap();
    assert!(!unstaged.staged);
    assert!(unstaged.unstaged);
}

#[test]
fn git_stage_and_unstage_directory() {
    let dir = tmp("git-stage-directory");
    std::fs::create_dir_all(dir.0.join("src/nested")).unwrap();
    std::fs::create_dir_all(dir.0.join("src-other")).unwrap();
    if !init_git_commit(
        &dir.0,
        &[
            ("src/app.ts", "before\n"),
            ("src/nested/deleted.ts", "delete me\n"),
            ("src-other/app.ts", "before\n"),
            ("ready.txt", "before\n"),
            (".gitignore", "src/ignored.txt\n"),
        ],
    ) {
        return;
    }
    std::fs::write(dir.0.join("src/app.ts"), "after\n").unwrap();
    std::fs::remove_dir_all(dir.0.join("src/nested")).unwrap();
    std::fs::create_dir_all(dir.0.join("src/added")).unwrap();
    std::fs::write(dir.0.join("src/added/new.ts"), "new\n").unwrap();
    std::fs::write(dir.0.join("src/ignored.txt"), "ignored\n").unwrap();
    std::fs::write(dir.0.join("src-other/app.ts"), "outside\n").unwrap();
    std::fs::write(dir.0.join("ready.txt"), "ready\n").unwrap();
    git_stage_file_for(&dir.0, "ready.txt").unwrap();

    git_stage_file_for(&dir.0, "src").unwrap();
    let index = git_diff_index_for(&dir.0);
    assert_eq!(index.files.len(), 5);
    for file in &index.files {
        let in_folder = file.relative.starts_with("src/");
        assert_eq!(file.staged, in_folder || file.relative == "ready.txt");
        assert_eq!(file.unstaged, file.relative == "src-other/app.ts");
    }

    git_unstage_file_for(&dir.0, "src").unwrap();
    let index = git_diff_index_for(&dir.0);
    assert_eq!(index.files.len(), 5);
    for file in &index.files {
        assert_eq!(file.staged, file.relative == "ready.txt");
        assert_eq!(file.unstaged, file.relative != "ready.txt");
    }
    assert_eq!(
        std::fs::read_to_string(dir.0.join("src/app.ts")).unwrap(),
        "after\n"
    );
    assert!(!dir.0.join("src/nested").exists());
}

#[test]
fn git_stage_and_unstage_deleted_directory() {
    let dir = tmp("git-stage-deleted-directory");
    std::fs::create_dir_all(dir.0.join("deleted/nested")).unwrap();
    if !init_git_commit(&dir.0, &[("deleted/nested/file.ts", "before\n")]) {
        return;
    }
    std::fs::remove_dir_all(dir.0.join("deleted")).unwrap();
    git_stage_file_for(&dir.0, "deleted").unwrap();
    let index = git_diff_index_for(&dir.0);
    assert_eq!(index.files.len(), 1);
    assert!(index.files[0].staged);
    assert!(!index.files[0].unstaged);

    git_unstage_file_for(&dir.0, "deleted").unwrap();
    let index = git_diff_index_for(&dir.0);
    assert_eq!(index.files.len(), 1);
    assert!(!index.files[0].staged);
    assert!(index.files[0].unstaged);
    assert!(!dir.0.join("deleted").exists());
}

#[cfg(unix)]
#[test]
fn git_stage_and_unstage_literal_directory_names() {
    for folder in ["*", "folder?", "[ab]", ":(glob)*"] {
        let dir = tmp("git-stage-literal-directory");
        for directory in [folder, "a", "folderx"] {
            std::fs::create_dir(dir.0.join(directory)).unwrap();
        }
        let inside = format!("{folder}/inside.txt");
        let tracked = [
            inside.as_str(),
            "a/other.txt",
            "folderx/other.txt",
            "ready.txt",
        ];
        let initial: Vec<_> = tracked.iter().map(|path| (*path, "before\n")).collect();
        if !init_git_commit(&dir.0, &initial) {
            return;
        }
        for path in tracked {
            std::fs::write(dir.0.join(path), "after\n").unwrap();
        }
        std::fs::write(dir.0.join("private.txt"), "unrelated untracked data\n").unwrap();
        let staged_paths = || {
            git_run(&dir.0, &["diff", "--cached", "--name-only", "-z"])
                .unwrap()
                .split('\0')
                .filter(|path| !path.is_empty())
                .map(str::to_string)
                .collect::<Vec<_>>()
        };

        git_stage_file_for(&dir.0, "ready.txt").unwrap();
        git_stage_file_for(&dir.0, folder).unwrap();
        let mut expected = vec![inside.clone(), "ready.txt".to_string()];
        expected.sort();
        assert_eq!(staged_paths(), expected, "stage folder {folder}");

        git_unstage_file_for(&dir.0, folder).unwrap();
        assert_eq!(staged_paths(), vec!["ready.txt"], "unstage folder {folder}");
        assert_eq!(
            std::fs::read_to_string(dir.0.join(&inside)).unwrap(),
            "after\n"
        );
    }
}

#[test]
fn git_stage_contents_stages_partial_hunk() {
    let dir = tmp("git-stage-contents");
    if !init_git_commit(&dir.0, &[("a.txt", "alpha\nbeta\ngamma\ndelta\n")]) {
        return;
    }
    std::fs::write(dir.0.join("a.txt"), "alpha\nBETA\ngamma\nDELTA\n").unwrap();
    git_stage_contents_for(&dir.0, "a.txt", b"alpha\nBETA\ngamma\ndelta\n").unwrap();

    let file = git_diff_index_for(&dir.0)
        .files
        .into_iter()
        .find(|file| file.relative == "a.txt")
        .unwrap();
    assert!(file.staged);
    assert!(file.unstaged);

    let diff = git_file_diff_for(&dir.0, "a.txt", false).unwrap();
    assert_eq!(diff.original, "alpha\nBETA\ngamma\ndelta\n");
    assert_eq!(diff.current, "alpha\nBETA\ngamma\nDELTA\n");
}

#[test]
fn git_discard_restores_tracked_and_deletes_untracked() {
    let dir = tmp("git-discard");
    if !init_git_commit(&dir.0, &[("a.txt", "alpha\n")]) {
        return;
    }
    std::fs::write(dir.0.join("a.txt"), "beta\n").unwrap();
    std::fs::write(dir.0.join("new.txt"), "hello\n").unwrap();

    git_discard_file_for(&dir.0, "a.txt").unwrap();
    git_discard_file_for(&dir.0, "new.txt").unwrap();

    assert_eq!(
        std::fs::read_to_string(dir.0.join("a.txt")).unwrap(),
        "alpha\n"
    );
    assert!(!dir.0.join("new.txt").exists());
    assert!(git_diff_index_for(&dir.0).files.is_empty());
}

#[test]
fn git_discard_all_restores_unstaged_and_keeps_staged() {
    let dir = tmp("git-discard-all");
    if !init_git_commit(&dir.0, &[("a.txt", "alpha\n"), ("b.txt", "one\n")]) {
        return;
    }
    std::fs::write(dir.0.join("a.txt"), "beta\n").unwrap();
    std::fs::write(dir.0.join("b.txt"), "two\n").unwrap();
    git_stage_file_for(&dir.0, "b.txt").unwrap();
    std::fs::write(dir.0.join("b.txt"), "three\n").unwrap();
    std::fs::write(dir.0.join("new.txt"), "hello\n").unwrap();

    git_discard_all_for(&dir.0).unwrap();

    assert_eq!(
        std::fs::read_to_string(dir.0.join("a.txt")).unwrap(),
        "alpha\n"
    );
    assert_eq!(
        std::fs::read_to_string(dir.0.join("b.txt")).unwrap(),
        "two\n"
    );
    assert!(!dir.0.join("new.txt").exists());
    let file = git_diff_index_for(&dir.0)
        .files
        .into_iter()
        .find(|file| file.relative == "b.txt")
        .unwrap();
    assert!(file.staged);
    assert!(!file.unstaged);
    assert!(git_diff_index_for(&dir.0)
        .files
        .iter()
        .all(|file| !file.unstaged));
}

#[test]
fn git_discard_keeps_staged_hunks() {
    let dir = tmp("git-discard-staged");
    if !init_git_commit(&dir.0, &[("a.txt", "alpha\n")]) {
        return;
    }
    std::fs::write(dir.0.join("a.txt"), "beta\n").unwrap();
    git_stage_file_for(&dir.0, "a.txt").unwrap();
    std::fs::write(dir.0.join("a.txt"), "gamma\n").unwrap();
    git_discard_file_for(&dir.0, "a.txt").unwrap();
    assert_eq!(
        std::fs::read_to_string(dir.0.join("a.txt")).unwrap(),
        "beta\n"
    );
    let file = git_diff_index_for(&dir.0)
        .files
        .into_iter()
        .find(|file| file.relative == "a.txt")
        .unwrap();
    assert!(file.staged);
    assert!(!file.unstaged);
}

#[test]
fn git_staged_context_reads_cached_diff() {
    let dir = tmp("git-staged-context");
    if !init_git_commit(&dir.0, &[("a.txt", "alpha\n")]) {
        return;
    }
    std::fs::write(dir.0.join("a.txt"), "beta\n").unwrap();
    git_stage_file_for(&dir.0, "a.txt").unwrap();
    let context = git_staged_context_for(&dir.0).unwrap();
    assert_eq!(context.branch.as_deref(), Some("main"));
    assert!(context.summary.contains("a.txt"));
    assert!(context.patch.contains("beta"));
}

#[test]
fn git_sync_counts_unpushed_commits() {
    let repo = tmp("git-ahead-repo");
    let origin = tmp("git-ahead-origin");
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
    {
        return;
    }
    std::fs::write(repo.0.join("a.txt"), "beta\n").unwrap();
    git_stage_file_for(&repo.0, "a.txt").unwrap();
    git_commit_for(&repo.0, "second").unwrap();
    let index = git_diff_index_for(&repo.0);
    assert_eq!(index.remote.as_deref(), Some("origin"));
    assert_eq!(index.upstream.as_deref(), Some("origin/main"));
    assert_eq!(index.default_branch.as_deref(), Some("main"));
    assert_eq!(index.ahead, 1);
    assert_eq!(index.behind, 0);
    assert_eq!(index.ahead_of_default, 1);
}

#[test]
fn git_sync_counts_feature_branch_without_upstream() {
    let repo = tmp("git-feature-repo");
    let origin = tmp("git-feature-origin");
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
        || !git(&repo.0, &["checkout", "-b", "feature"])
    {
        return;
    }
    std::fs::write(repo.0.join("a.txt"), "beta\n").unwrap();
    git_stage_file_for(&repo.0, "a.txt").unwrap();
    git_commit_for(&repo.0, "feature work").unwrap();
    let index = git_diff_index_for(&repo.0);
    assert_eq!(index.branch.as_deref(), Some("feature"));
    assert_eq!(index.upstream, None);
    assert_eq!(index.ahead, 1);
    assert_eq!(index.ahead_of_default, 1);
    let range = git_range_context_for(&repo.0).unwrap();
    assert_eq!(range.base, "main");
    assert_eq!(range.head, "feature");
    assert!(range.commit_summary.contains("feature work"));
}

#[test]
fn git_stage_rejects_path_escape() {
    let dir = tmp("git-stage-escape");
    assert!(git_stage_file_for(&dir.0, "../secret.txt").is_err());
    assert!(git_discard_file_for(&dir.0, "../secret.txt").is_err());
}
