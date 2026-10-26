use super::*;

use std::path::PathBuf;
use std::process::Command;

use crate::git::commit::{git_commit_amend_for, git_commit_for};
use crate::git::file_diff::git_diff_full_context;
use crate::git::index::git_diff_index_for;
use crate::git::range::ensure_git_commit;
use crate::git::selection::{git_commit_selected_for, git_selected_context_for};
use crate::git::stage::git_stage_file_for;
use crate::github::repo::github_fetch_remote;
use crate::test_support::{git, init_git_commit, tmp};

#[test]
fn selected_commit_preserves_other_staged_files() {
    let repo = tmp("selected-commit");
    assert!(init_git_commit(
        &repo.0,
        &[("chosen.txt", "old\n"), ("other.txt", "old\n")]
    ));
    std::fs::write(repo.0.join("other.txt"), "unrelated staged\n").unwrap();
    assert!(git(&repo.0, &["add", "other.txt"]));
    std::fs::write(repo.0.join("chosen.txt"), "partial staging\n").unwrap();
    assert!(git(&repo.0, &["add", "chosen.txt"]));
    std::fs::write(repo.0.join("chosen.txt"), "chosen working tree\n").unwrap();

    git_commit_selected_for(&repo.0, "Selected only", &["chosen.txt".into()]).unwrap();
    assert_eq!(
        git_stdout(&repo.0, &["show", "HEAD:chosen.txt"]).as_deref(),
        Some("chosen working tree")
    );
    assert_eq!(
        git_stdout(&repo.0, &["show", "HEAD:other.txt"]).as_deref(),
        Some("old")
    );
    assert_eq!(
        git_stdout(&repo.0, &["show", ":other.txt"]).as_deref(),
        Some("unrelated staged")
    );
    assert_eq!(
        git_stdout(&repo.0, &["diff", "--cached", "--name-only"]).as_deref(),
        Some("other.txt")
    );
    // The existing whole-index workflow remains available to other panels.
    git_commit_for(&repo.0, "Remaining staged work").unwrap();
    assert_eq!(
        git_stdout(&repo.0, &["show", "HEAD:other.txt"]).as_deref(),
        Some("unrelated staged")
    );
}

#[test]
fn selected_context_keeps_index_and_excluded_content_private() {
    let repo = tmp("selected-context");
    assert!(init_git_commit(
        &repo.0,
        &[
            ("chosen.txt", "old\n"),
            ("secret.txt", "old\n"),
            ("deleted.txt", "gone\n")
        ]
    ));
    std::fs::write(repo.0.join("secret.txt"), "EXCLUDED_SECRET\n").unwrap();
    std::fs::write(repo.0.join("chosen.txt"), "partial staging\n").unwrap();
    assert!(git(&repo.0, &["add", "."]));
    std::fs::write(repo.0.join("chosen.txt"), "selected work\n").unwrap();
    std::fs::write(repo.0.join("new.txt"), "selected new\n").unwrap();
    std::fs::remove_file(repo.0.join("deleted.txt")).unwrap();
    assert!(git(&repo.0, &["add", "deleted.txt"]));
    let index = std::fs::read(repo.0.join(".git/index")).unwrap();
    let head = git_stdout(&repo.0, &["rev-parse", "HEAD"]);
    let paths = vec!["chosen.txt".into(), "new.txt".into(), "deleted.txt".into()];

    let context = git_selected_context_for(&repo.0, &paths).unwrap();
    assert!(context.patch.contains("+selected work"));
    assert!(context.patch.contains("+selected new"));
    assert!(context.patch.contains("-gone"));
    assert!(!context.patch.contains("EXCLUDED_SECRET"));
    assert!(!context.summary.contains("secret.txt"));
    assert_eq!(std::fs::read(repo.0.join(".git/index")).unwrap(), index);
    assert_eq!(git_stdout(&repo.0, &["rev-parse", "HEAD"]), head);

    git_commit_selected_for(&repo.0, "Add and delete selected files", &paths).unwrap();
    assert_eq!(
        git_stdout(&repo.0, &["show", "HEAD:new.txt"]).as_deref(),
        Some("selected new")
    );
    assert!(git_stdout(&repo.0, &["show", "HEAD:deleted.txt"]).is_none());
    assert_eq!(
        git_stdout(&repo.0, &["show", ":secret.txt"]).as_deref(),
        Some("EXCLUDED_SECRET")
    );
}

#[cfg(unix)]
#[test]
fn selected_filenames_are_literal() {
    let repo = tmp("selected-literal");
    assert!(init_git_commit(&repo.0, &[("other.txt", "old\n")]));
    std::fs::write(repo.0.join("other.txt"), "excluded\n").unwrap();
    let paths: Vec<String> = [
        "*",
        ":(glob)*",
        "-flag",
        "line\nbreak",
        "back\\slash",
        "hello é.txt",
    ]
    .into_iter()
    .map(String::from)
    .collect();
    for path in &paths {
        std::fs::write(repo.0.join(path), "literal file\n").unwrap();
    }
    git_commit_selected_for(&repo.0, "Literal filenames", &paths).unwrap();
    assert_eq!(
        git_stdout(&repo.0, &["show", "HEAD:other.txt"]).as_deref(),
        Some("old")
    );
    for path in paths {
        assert_eq!(
            git_stdout(&repo.0, &["show", &format!("HEAD:{path}")]).as_deref(),
            Some("literal file")
        );
    }
}

#[test]
fn git_commit_clears_staged_files() {
    let dir = tmp("git-commit");
    if !init_git_commit(&dir.0, &[("a.txt", "alpha\n")]) {
        return;
    }
    std::fs::write(dir.0.join("a.txt"), "beta\n").unwrap();
    git_stage_file_for(&dir.0, "a.txt").unwrap();
    git_commit_for(&dir.0, "update a").unwrap();
    let index = git_diff_index_for(&dir.0);
    assert!(index.files.is_empty());
    assert_eq!(index.head, git_stdout(&dir.0, &["rev-parse", "HEAD"]));
    assert_eq!(
        git_stdout(&dir.0, &["log", "-1", "--pretty=%s"]).as_deref(),
        Some("update a")
    );
}

#[test]
fn git_commit_amend_rewrites_head_with_staged_changes() {
    let dir = tmp("git-commit-amend");
    if !init_git_commit(&dir.0, &[("a.txt", "alpha\n")]) {
        return;
    }
    std::fs::write(dir.0.join("a.txt"), "beta\n").unwrap();
    git_stage_file_for(&dir.0, "a.txt").unwrap();
    git_commit_amend_for(&dir.0, "amended").unwrap();
    assert!(git_diff_index_for(&dir.0).files.is_empty());
    assert_eq!(
        git_stdout(&dir.0, &["rev-list", "--count", "HEAD"]).as_deref(),
        Some("1")
    );
    assert_eq!(
        git_stdout(&dir.0, &["log", "-1", "--pretty=%s"]).as_deref(),
        Some("amended")
    );
    assert_eq!(
        git_stdout(&dir.0, &["show", "HEAD:a.txt"]).as_deref(),
        Some("beta")
    );
}

#[test]
fn git_commit_amend_rewords_without_staged_changes() {
    let dir = tmp("git-commit-reword");
    if !init_git_commit(&dir.0, &[("a.txt", "alpha\n")]) {
        return;
    }
    git_commit_amend_for(&dir.0, "reworded").unwrap();
    assert_eq!(
        git_stdout(&dir.0, &["rev-list", "--count", "HEAD"]).as_deref(),
        Some("1")
    );
    assert_eq!(
        git_stdout(&dir.0, &["log", "-1", "--pretty=%s"]).as_deref(),
        Some("reworded")
    );
}

#[test]
fn git_diff_full_context_includes_distant_lines() {
    let dir = tmp("git-full-context");
    let original = (1..=40)
        .map(|i| format!("line-{i}"))
        .collect::<Vec<_>>()
        .join("\n")
        + "\n";
    if !init_git_commit(&dir.0, &[("big.txt", &original)]) {
        return;
    }
    let base = git_run(&dir.0, &["rev-parse", "HEAD"])
        .unwrap()
        .trim()
        .to_string();
    let updated = original.replace("line-30", "LINE-30");
    std::fs::write(dir.0.join("big.txt"), &updated).unwrap();
    if !git(&dir.0, &["add", "."]) || !git(&dir.0, &["commit", "-m", "edit"]) {
        return;
    }
    let head = git_run(&dir.0, &["rev-parse", "HEAD"])
        .unwrap()
        .trim()
        .to_string();
    let (patch, truncated) = git_diff_full_context(&dir.0, &base, &head).unwrap();
    assert!(!truncated);
    assert!(
        patch.contains("line-1"),
        "expected distant context in patch:\n{patch}"
    );
    assert!(patch.contains("LINE-30"), "expected changed line:\n{patch}");
    let default = git_run(&dir.0, &["diff", &base, &head]).unwrap_or_default();
    assert!(
        !default.contains("line-1"),
        "default context should omit distant lines"
    );
}

#[test]
fn git_diff_full_context_uses_canonical_plain_output() {
    let dir = tmp("git-full-context-canonical");
    if !init_git_commit(&dir.0, &[("file.txt", "alpha\n")]) {
        return;
    }
    let base = git_run(&dir.0, &["rev-parse", "HEAD"])
        .unwrap()
        .trim()
        .to_string();
    std::fs::write(dir.0.join("file.txt"), "beta\n").unwrap();
    if !git(&dir.0, &["add", "."]) || !git(&dir.0, &["commit", "-m", "edit"]) {
        return;
    }
    let head = git_run(&dir.0, &["rev-parse", "HEAD"])
        .unwrap()
        .trim()
        .to_string();
    let helper = dir.0.join("ext-diff.sh");
    std::fs::write(&helper, "#!/bin/sh\necho EXTERNAL\n").unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut permissions = std::fs::metadata(&helper).unwrap().permissions();
        permissions.set_mode(0o755);
        std::fs::set_permissions(&helper, permissions).unwrap();
    }
    if !git(&dir.0, &["config", "color.ui", "always"])
        || !git(&dir.0, &["config", "color.diff", "always"])
        || !git(&dir.0, &["config", "diff.noprefix", "true"])
        || !git(
            &dir.0,
            &["config", "diff.external", &helper.to_string_lossy()],
        )
    {
        return;
    }
    let raw = git_run(&dir.0, &["diff", &format!("{base}...{head}")]).unwrap_or_default();
    assert!(
        raw.contains("EXTERNAL") || !raw.contains("diff --git a/file.txt b/file.txt"),
        "hostile git settings should change a default diff:\n{raw}"
    );
    let (patch, truncated) = git_diff_full_context(&dir.0, &base, &head).unwrap();
    assert!(!truncated);
    assert!(
        patch.contains("diff --git a/file.txt b/file.txt"),
        "expected canonical prefixes:\n{patch}"
    );
    assert!(
        !patch.contains('\u{1b}') && !patch.contains("EXTERNAL"),
        "expected plain git diff output:\n{patch}"
    );
}

#[test]
fn git_diff_full_context_errors_without_a_merge_base() {
    let dir = tmp("git-full-context-unrelated");
    if !init_git_commit(&dir.0, &[("a.txt", "alpha\n")]) {
        return;
    }
    let base = git_run(&dir.0, &["rev-parse", "HEAD"])
        .unwrap()
        .trim()
        .to_string();
    if !git(&dir.0, &["checkout", "--orphan", "other"]) {
        return;
    }
    let _ = std::fs::remove_file(dir.0.join("a.txt"));
    std::fs::write(dir.0.join("b.txt"), "beta\n").unwrap();
    if !git(&dir.0, &["add", "."]) || !git(&dir.0, &["commit", "-m", "other"]) {
        return;
    }
    let head = git_run(&dir.0, &["rev-parse", "HEAD"])
        .unwrap()
        .trim()
        .to_string();
    assert!(git_run(&dir.0, &["merge-base", &base, &head]).is_none());
    let two_dot = git_run(&dir.0, &["diff", &base, &head]).unwrap_or_default();
    assert!(
        two_dot.contains("alpha") || two_dot.contains("beta"),
        "two-dot should invent a comparison:\n{two_dot}"
    );
    let err = git_diff_full_context(&dir.0, &base, &head).unwrap_err();
    assert!(
        err.to_lowercase().contains("merge base"),
        "expected merge-base error, got {err}"
    );
}

#[test]
fn ensure_git_commit_fetches_from_gh_resolved_remote() {
    let remote = tmp("git-full-context-upstream");
    if !init_git_commit(&remote.0, &[("note.txt", "hello\n")]) {
        return;
    }
    let oid = git_run(&remote.0, &["rev-parse", "HEAD"])
        .unwrap()
        .trim()
        .to_string();
    let decoy = tmp("git-full-context-origin");
    if !init_git_commit(&decoy.0, &[("other.txt", "decoy\n")]) {
        return;
    }
    let local = tmp("git-full-context-local");
    if !init_git_commit(&local.0, &[("local.txt", "local\n")]) {
        return;
    }
    let upstream_url = remote.0.to_string_lossy().into_owned();
    let origin_url = decoy.0.to_string_lossy().into_owned();
    if !git(&local.0, &["remote", "add", "origin", &origin_url])
        || !git(&local.0, &["remote", "add", "upstream", &upstream_url])
        || !git(&local.0, &["config", "remote.upstream.gh-resolved", "base"])
    {
        return;
    }
    assert_eq!(github_fetch_remote(&local.0).as_deref(), Some("upstream"));
    let spec = format!("{oid}^{{commit}}");
    assert!(git_output(&local.0, &["cat-file", "-e", &spec]).is_none());
    ensure_git_commit(&local.0, &oid).unwrap();
    assert!(git_output(&local.0, &["cat-file", "-e", &spec]).is_some());
}

fn git_cmd_path(cmd: &Command) -> Vec<PathBuf> {
    let path = cmd
        .get_envs()
        .find(|(key, _)| *key == std::ffi::OsStr::new("PATH"))
        .and_then(|(_, value)| value)
        .expect("git should get an explicit PATH");
    std::env::split_paths(path).collect()
}

/// git-lfs and other filters live in Homebrew dirs a Finder launch lacks.
#[test]
fn read_only_git_cmd_path_adds_fixed_dirs_to_inherited_path() {
    let path = git_cmd_path(&git_cmd());
    assert!(path.contains(&PathBuf::from("/opt/homebrew/bin")));
    assert!(path.contains(&PathBuf::from("/usr/local/bin")));
    if let Some(inherited) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&inherited) {
            assert!(path.contains(&dir), "missing inherited {dir:?}");
        }
    }
}

#[test]
fn local_git_never_resolves_login_shell_path() {
    for action in ["status", "diff", "add", "restore", "cat-file"] {
        let cmd = git_cmd_for_args_with_path(&[action], || {
            panic!("local git must not resolve the login-shell PATH")
        });
        assert!(git_cmd_path(&cmd).contains(&PathBuf::from("/opt/homebrew/bin")));
    }
}

#[test]
fn git_actions_that_need_helpers_use_login_shell_path() {
    for action in ["commit", "push", "pull", "fetch", "clone"] {
        let cmd = git_cmd_for_args_with_path(&[action], || "gui-git-path".into());
        assert!(cmd.get_envs().any(|(key, value)| {
            key == std::ffi::OsStr::new("PATH")
                && value == Some(std::ffi::OsStr::new("gui-git-path"))
        }));
    }
}
