use super::super::types::CardCreate;
use crate::store::Store;
use rusqlite::Connection;
use std::{path::Path, process::Command};

fn git(path: &Path, args: &[&str]) {
    let output = Command::new("git")
        .current_dir(path)
        .args(args)
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
}

pub(super) fn project(path: &Path) -> String {
    std::fs::create_dir(path).unwrap();
    git(path, &["init", "-q"]);
    git(
        path,
        &[
            "-c",
            "user.name=Fixture",
            "-c",
            "user.email=fixture@example.test",
            "-c",
            "commit.gpgsign=false",
            "commit",
            "--allow-empty",
            "-qm",
            "fixture",
        ],
    );
    path.to_str().unwrap().to_owned()
}

pub(super) fn input(project: &str) -> CardCreate {
    CardCreate {
        id: "card-creation".into(),
        project_cwd: project.into(),
        title: "  Native Board  ".into(),
        description: "  Build a card  ".into(),
        acceptance_criteria: "  Saved once  ".into(),
        base_ref: Some("  main  ".into()),
    }
}

#[test]
fn board_creation_persists_source_card_and_exact_initial_artifact() {
    let dir = tempfile::tempdir().unwrap();
    let cwd = project(&dir.path().join("project"));
    let path = dir.path().join("molfar.db");
    let mut store = Store::open_desktop(&path).unwrap();
    let card = store
        .board_create(&input(&cwd), std::slice::from_ref(&cwd))
        .unwrap();
    assert_eq!(card.title, "Native Board");
    assert_eq!(card.description, "Build a card");
    assert_eq!(card.acceptance_criteria, "Saved once");
    assert_eq!(card.base_ref.as_deref(), Some("main"));
    assert_eq!(
        (
            card.number,
            card.column_id.as_str(),
            card.run_state.as_str()
        ),
        (1, "backlog", "idle")
    );
    let expected = format!(
        "# #1 Native Board\n\n- Project: {cwd}\n- Base branch: main\n\n## Description\n\nBuild a card\n\n## Acceptance criteria\n\nSaved once"
    );
    assert_eq!(
        std::fs::read_to_string(dir.path().join("task-board/card-creation/task-1.md")).unwrap(),
        expected
    );
    drop(store);
    let snapshot = Store::open_desktop(&path)
        .unwrap()
        .board_snapshot(None, false, Some(&card.id))
        .unwrap();
    assert_eq!(snapshot.cards, vec![card]);
    assert_eq!(snapshot.artifacts.len(), 1);
    assert_eq!(
        (
            snapshot.artifacts[0].kind.as_str(),
            snapshot.artifacts[0].source.as_str(),
            snapshot.artifacts[0].version
        ),
        ("task", "user", 1)
    );
    assert!(snapshot.runs.is_empty());
    assert!(snapshot.settings_json.is_none());
}

#[test]
fn board_creation_retries_repair_partial_success_without_duplicate_or_changed_card() {
    let dir = tempfile::tempdir().unwrap();
    let cwd = project(&dir.path().join("project"));
    let path = dir.path().join("molfar.db");
    let mut store = Store::open_desktop(&path).unwrap();
    std::fs::write(dir.path().join("task-board"), "blocked").unwrap();
    assert!(store
        .board_create(&input(&cwd), std::slice::from_ref(&cwd))
        .is_err());
    let before = store
        .board_snapshot(None, false, None)
        .unwrap()
        .cards
        .remove(0);
    std::fs::remove_file(dir.path().join("task-board")).unwrap();
    let mut retry = input("/not-registered");
    retry.title = "Different draft".into();
    for _ in 0..2 {
        assert_eq!(store.board_create(&retry, &[]).unwrap(), before);
    }
    let snapshot = store.board_snapshot(None, false, None).unwrap();
    assert_eq!(snapshot.cards.len(), 1);
    assert_eq!(snapshot.artifacts.len(), 1);
}

#[test]
fn board_creation_rejects_invalid_project_or_fields_before_inserting() {
    let dir = tempfile::tempdir().unwrap();
    let cwd = project(&dir.path().join("project"));
    let mut store = Store::open_desktop(&dir.path().join("molfar.db")).unwrap();
    assert!(store.board_create(&input(&cwd), &[]).is_err());
    for (field, value) in [
        ("id", "../escape"),
        ("title", " "),
        ("description", " "),
        ("base", "--help"),
    ] {
        let mut bad = input(&cwd);
        match field {
            "id" => bad.id = value.into(),
            "title" => bad.title = value.into(),
            "description" => bad.description = value.into(),
            _ => bad.base_ref = Some(value.into()),
        }
        assert!(store
            .board_create(&bad, std::slice::from_ref(&cwd))
            .is_err());
    }
    let unborn = dir.path().join("unborn");
    std::fs::create_dir(&unborn).unwrap();
    git(&unborn, &["init", "-q"]);
    let unborn = unborn.to_str().unwrap().to_owned();
    assert!(store.board_create(&input(&unborn), &[unborn]).is_err());
    assert!(store
        .board_snapshot(None, false, None)
        .unwrap()
        .cards
        .is_empty());
    assert!(!dir.path().join("task-board").exists());
}

#[test]
fn board_creation_read_only_does_not_repair_files() {
    let dir = tempfile::tempdir().unwrap();
    let cwd = project(&dir.path().join("project"));
    let path = dir.path().join("molfar.db");
    let mut store = Store::open_desktop(&path).unwrap();
    store
        .board_create(&input(&cwd), std::slice::from_ref(&cwd))
        .unwrap();
    drop(store);
    let artifact = dir.path().join("task-board/card-creation/task-1.md");
    std::fs::remove_file(&artifact).unwrap();
    Connection::open(&path)
        .unwrap()
        .execute("DELETE FROM task_board_artifacts", [])
        .unwrap();
    let mut read_only = Store::read_desktop(&path).unwrap();
    assert!(read_only
        .board_create(&input(&cwd), &[cwd])
        .unwrap_err()
        .contains("read-only"));
    assert!(!artifact.exists());
}
