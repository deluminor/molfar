use super::{branch, snapshot};
use crate::git::git;
use std::path::Path;

pub(super) fn repository(root: &Path) {
    git(root, &["init", "-b", "main"]).unwrap();
    git(root, &["config", "core.autocrlf", "false"]).unwrap();
    std::fs::write(root.join("file"), "base\n").unwrap();
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
}

#[test]
fn snapshot_detects_changed_bytes_even_when_head_and_porcelain_match() {
    let directory = tempfile::tempdir().unwrap();
    repository(directory.path());
    let file = directory.path().join("file");
    std::fs::write(&file, "first\n").unwrap();
    let before = snapshot(directory.path()).unwrap();
    std::fs::write(&file, "second\n").unwrap();
    let after = snapshot(directory.path()).unwrap();
    assert_eq!(before.head, after.head);
    assert_eq!(before.porcelain, after.porcelain);
    assert_ne!(before.fingerprint, after.fingerprint);
}

#[test]
fn snapshot_detects_index_changes_with_identical_worktree_and_porcelain() {
    let directory = tempfile::tempdir().unwrap();
    repository(directory.path());
    let path = directory.path().join("file");
    std::fs::write(&path, "index one\n").unwrap();
    git(directory.path(), &["add", "file"]).unwrap();
    std::fs::write(&path, "worktree\n").unwrap();
    let before = snapshot(directory.path()).unwrap();
    std::fs::write(&path, "index two\n").unwrap();
    git(directory.path(), &["add", "file"]).unwrap();
    std::fs::write(&path, "worktree\n").unwrap();
    let after = snapshot(directory.path()).unwrap();
    assert_eq!(before.head, after.head);
    assert_eq!(before.porcelain, after.porcelain);
    assert_ne!(before.fingerprint, after.fingerprint);
}

#[test]
fn source_branch_normalization_and_default_policy_do_not_fall_back_to_head() {
    assert_eq!(
        branch::name("AbC_123", "Café Déjà vu"),
        "molfar/task-abc123-cafe-de-ja-vu"
    );
    assert_eq!(branch::name("abcdef", "完全"), "molfar/task-abcdef");
    let directory = tempfile::tempdir().unwrap();
    repository(directory.path());
    assert_eq!(branch::default_base(directory.path()).unwrap(), "main");
    git(directory.path(), &["branch", "-m", "feature-only"]).unwrap();
    assert!(branch::default_base(directory.path()).is_err());
}

fn card(root: &Path) -> crate::task_board::types::Card {
    use crate::{store::Store, task_board::types::CardCreate};
    let mut store = Store::open_desktop(&root.join(".git/board-fixture.db")).unwrap();
    let cwd = root.to_str().unwrap().to_owned();
    store
        .board_create(
            &CardCreate {
                id: "abc123-card".into(),
                project_cwd: cwd.clone(),
                title: "Add board".into(),
                description: "Analyze and plan".into(),
                acceptance_criteria: String::new(),
                base_ref: None,
            },
            &[cwd],
        )
        .unwrap()
}

#[test]
fn retained_worktree_preserves_main_bytes_and_reuses_identity_after_title_changes() {
    let directory = tempfile::tempdir().unwrap();
    repository(directory.path());
    let mut card = card(directory.path());
    std::fs::write(directory.path().join("file"), "user changes\n").unwrap();
    let before = snapshot(directory.path()).unwrap();
    let tree = super::ensure_worktree(&card).unwrap();
    assert_eq!(tree.branch, "molfar/task-abc123-add-board");
    assert_eq!(
        std::fs::read_to_string(Path::new(&tree.path).join("file")).unwrap(),
        "base\n"
    );
    assert_eq!(before, snapshot(directory.path()).unwrap());
    card.title = "Renamed task".into();
    card.branch = Some(tree.branch.clone());
    card.worktree_path = Some(tree.path.clone());
    card.base_sha = Some(tree.base_sha.clone());
    card.base_ref = Some(tree.base_ref.clone());
    assert_eq!(super::ensure_worktree(&card).unwrap(), tree);
    card.worktree_path = Some(directory.path().to_str().unwrap().into());
    assert!(super::ensure_worktree(&card).is_err());
}

#[test]
fn materialized_handoff_is_ignored_and_keeps_unrecognized_files() {
    use crate::task_board::stage::contracts::types::HandoffInput;
    let directory = tempfile::tempdir().unwrap();
    repository(directory.path());
    let before = snapshot(directory.path()).unwrap();
    let input = HandoffInput {
        kind: "task".into(),
        version: 2,
        body: "Canonical task\n".into(),
    };
    let files = super::materialize(directory.path(), std::slice::from_ref(&input)).unwrap();
    assert_eq!(files[0].path, ".molfar/board/task-v2.md");
    assert_eq!(
        std::fs::read_to_string(directory.path().join(&files[0].path)).unwrap(),
        input.body
    );
    let keep = directory.path().join(".molfar/board/keep.txt");
    std::fs::write(&keep, "preserve").unwrap();
    super::materialize(directory.path(), &[input]).unwrap();
    assert_eq!(std::fs::read_to_string(&keep).unwrap(), "preserve");
    assert_eq!(before, snapshot(directory.path()).unwrap());
}

#[test]
fn tracked_handoff_files_are_preserved_and_preparation_is_refused() {
    use crate::task_board::stage::contracts::types::HandoffInput;
    let directory = tempfile::tempdir().unwrap();
    repository(directory.path());
    let path = directory.path().join(".molfar/board/task-v1.md");
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(&path, "Tracked user content").unwrap();
    git(directory.path(), &["add", ".molfar/board/task-v1.md"]).unwrap();
    let before = snapshot(directory.path()).unwrap();
    let result = super::materialize(
        directory.path(),
        &[HandoffInput {
            kind: "task".into(),
            version: 1,
            body: "Engine handoff".into(),
        }],
    );
    assert!(result.is_err());
    assert_eq!(
        std::fs::read_to_string(path).unwrap(),
        "Tracked user content"
    );
    assert_eq!(before, snapshot(directory.path()).unwrap());
    assert!(!directory.path().join(".molfar/board/.gitignore").exists());
}

#[cfg(unix)]
#[test]
fn lossless_untracked_names_and_binary_bytes_participate_in_fingerprint() {
    let directory = tempfile::tempdir().unwrap();
    repository(directory.path());
    #[cfg(not(target_os = "macos"))]
    let name = {
        use std::{ffi::OsString, os::unix::ffi::OsStringExt};
        OsString::from_vec(vec![b'n', 0xff])
    };
    #[cfg(target_os = "macos")]
    let name = std::ffi::OsString::from("назва\nfile");
    let path = directory.path().join(name);
    std::fs::write(&path, [0, 1, 255]).unwrap();
    let before = snapshot(directory.path()).unwrap();
    std::fs::write(&path, [0, 2, 255]).unwrap();
    let after = snapshot(directory.path()).unwrap();
    assert_eq!(before.head, after.head);
    assert_eq!(before.porcelain, after.porcelain);
    assert_ne!(before.fingerprint, after.fingerprint);
}

#[cfg(unix)]
#[test]
fn symlink_handoff_directories_and_files_are_rejected_without_outside_writes() {
    use crate::task_board::stage::contracts::types::HandoffInput;
    use std::os::unix::fs::symlink;
    let directory = tempfile::tempdir().unwrap();
    repository(directory.path());
    let outside = tempfile::tempdir().unwrap();
    let input = HandoffInput {
        kind: "task".into(),
        version: 1,
        body: "Task".into(),
    };
    symlink(outside.path(), directory.path().join(".molfar")).unwrap();
    assert!(super::materialize(directory.path(), std::slice::from_ref(&input)).is_err());
    assert_eq!(std::fs::read_dir(outside.path()).unwrap().count(), 0);
    std::fs::remove_file(directory.path().join(".molfar")).unwrap();
    std::fs::create_dir_all(directory.path().join(".molfar/board")).unwrap();
    let protected = outside.path().join("protected");
    std::fs::write(&protected, "preserve").unwrap();
    symlink(
        &protected,
        directory.path().join(".molfar/board/task-v1.md"),
    )
    .unwrap();
    assert!(super::materialize(directory.path(), &[input]).is_err());
    assert_eq!(std::fs::read_to_string(&protected).unwrap(), "preserve");
}
