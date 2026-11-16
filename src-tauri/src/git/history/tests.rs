use super::*;

use crate::test_support::{git, init_git_commit, tmp};

#[test]
fn parse_git_decorations_classifies_head_local_remote_and_tags() {
    let remotes = vec!["origin".to_string()];
    let (head, refs) = parse_git_decorations(
        "HEAD -> main, origin/main, origin/HEAD, tag: v0.1.30, fix/foo",
        Some("abc"),
        "abc",
        &remotes,
    );
    assert!(head);
    assert_eq!(
        refs,
        vec![
            GitHistoryRef {
                name: "main".into(),
                kind: "local".into()
            },
            GitHistoryRef {
                name: "origin/main".into(),
                kind: "remote".into()
            },
            GitHistoryRef {
                name: "v0.1.30".into(),
                kind: "tag".into()
            },
            GitHistoryRef {
                name: "fix/foo".into(),
                kind: "local".into()
            },
        ]
    );
}

#[test]
fn git_history_lists_commits_parents_and_head() {
    let dir = tmp("git-history");
    if !init_git_commit(&dir.0, &[("a.txt", "alpha\n")]) {
        return;
    }
    std::fs::write(dir.0.join("a.txt"), "beta\n").unwrap();
    assert!(git(&dir.0, &["add", "."]));
    assert!(git(&dir.0, &["commit", "-m", "second"]));

    let history = git_history_for(&dir.0, Some(10)).unwrap();
    assert_eq!(history.commits.len(), 2);
    assert_eq!(history.commits[0].subject, "second");
    assert_eq!(history.commits[1].subject, "init");
    assert_eq!(
        history.commits[0].parents,
        vec![history.commits[1].sha.clone()]
    );
    assert!(history.commits[0].head);
    assert!(!history.commits[1].head);
    assert!(history.commits[0]
        .refs
        .iter()
        .any(|r| r.kind == "local" && r.name == "main"));
}

#[test]
fn git_history_empty_outside_a_repo() {
    let dir = tmp("git-history-none");
    assert_eq!(
        git_history_for(&dir.0, None).unwrap(),
        GitHistory::default()
    );
}

#[test]
fn git_history_records_merge_parents() {
    let dir = tmp("git-history-merge");
    if !init_git_commit(&dir.0, &[("a.txt", "alpha\n")]) {
        return;
    }
    assert!(git(&dir.0, &["checkout", "-b", "feature"]));
    std::fs::write(dir.0.join("feat.txt"), "one\n").unwrap();
    assert!(git(&dir.0, &["add", "."]));
    assert!(git(&dir.0, &["commit", "-m", "feature work"]));
    assert!(git(&dir.0, &["checkout", "main"]));
    std::fs::write(dir.0.join("main.txt"), "two\n").unwrap();
    assert!(git(&dir.0, &["add", "."]));
    assert!(git(&dir.0, &["commit", "-m", "main work"]));
    assert!(git(
        &dir.0,
        &["merge", "feature", "--no-ff", "-m", "Merge feature"]
    ));

    let history = git_history_for(&dir.0, Some(20)).unwrap();
    let merge = history
        .commits
        .iter()
        .find(|commit| commit.subject == "Merge feature")
        .unwrap();
    assert_eq!(merge.parents.len(), 2);
}

#[test]
fn git_history_skips_stash_and_unmerged_branches() {
    let dir = tmp("git-history-auto");
    if !init_git_commit(&dir.0, &[("a.txt", "alpha\n")]) {
        return;
    }
    assert!(git(&dir.0, &["checkout", "-b", "feature"]));
    std::fs::write(dir.0.join("feat.txt"), "one\n").unwrap();
    assert!(git(&dir.0, &["add", "."]));
    assert!(git(&dir.0, &["commit", "-m", "feature only"]));
    std::fs::write(dir.0.join("wip.txt"), "stash me\n").unwrap();
    assert!(git(&dir.0, &["stash", "push", "-u", "-m", "wip stash"]));
    assert!(git(&dir.0, &["checkout", "main"]));
    std::fs::write(dir.0.join("main.txt"), "two\n").unwrap();
    assert!(git(&dir.0, &["add", "."]));
    assert!(git(&dir.0, &["commit", "-m", "main only"]));

    let history = git_history_for(&dir.0, Some(20)).unwrap();
    let subjects: Vec<&str> = history
        .commits
        .iter()
        .map(|commit| commit.subject.as_str())
        .collect();
    assert!(subjects.contains(&"main only"));
    assert!(subjects.contains(&"init"));
    assert!(!subjects.iter().any(|s| s.contains("feature only")));
    assert!(!subjects
        .iter()
        .any(|s| s.contains("wip stash") || s.contains("WIP on")));
    assert!(!history
        .commits
        .iter()
        .any(|commit| commit.refs.iter().any(|r| r.name.contains("stash"))));
}
