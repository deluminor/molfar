use super::gate;
use crate::{store::Store, task_board::stage::lifecycle::types::StageAction};
use rusqlite::Connection;

#[test]
fn owner_load_rejects_empty_oversized_missing_and_nonregular_artifacts() {
    let (dir, store) = gate();
    let path = dir.path().join("task-board/card/plan-1.md");
    for body in [" ".to_owned(), "x".repeat(2_000_001)] {
        std::fs::write(&path, body).unwrap();
        assert!(store.board_owner_review("card").is_err());
    }
    std::fs::remove_file(&path).unwrap();
    assert!(store.board_owner_review("card").is_err());
    std::fs::create_dir(&path).unwrap();
    assert!(store
        .board_owner_review("card")
        .unwrap_err()
        .contains("Unsafe"));
}

#[cfg(unix)]
#[test]
fn owner_load_and_save_refuse_symlinks_and_fifo_without_following_or_blocking() {
    use std::os::unix::fs::symlink;
    let (dir, mut store) = gate();
    let folder = dir.path().join("task-board/card");
    let plan = folder.join("plan-1.md");
    let outside = dir.path().join("outside.md");
    std::fs::write(&outside, "Retain me").unwrap();
    let revision = store.board_owner_review("card").unwrap().card.updated_at;
    std::fs::remove_file(&plan).unwrap();
    symlink(&outside, &plan).unwrap();
    assert!(store
        .board_owner_review("card")
        .unwrap_err()
        .contains("Unsafe"));
    std::fs::remove_file(&plan).unwrap();
    assert!(std::process::Command::new("mkfifo")
        .arg(&plan)
        .status()
        .unwrap()
        .success());
    assert!(store
        .board_owner_review("card")
        .unwrap_err()
        .contains("Unsafe"));
    symlink(&outside, folder.join("answers-1.md")).unwrap();
    assert!(store
        .board_stage_action(
            "card",
            revision,
            StageAction::RequestChanges("Notes".into())
        )
        .is_err());
    assert_eq!(std::fs::read_to_string(outside).unwrap(), "Retain me");
}

#[test]
fn owner_actions_refuse_illegal_state_without_artifact_writes() {
    let (dir, mut store) = gate();
    let revision = store.board_owner_review("card").unwrap().card.updated_at;
    let conn = Connection::open(store.database_path()).unwrap();
    conn.execute("UPDATE task_board_cards SET archived=1 WHERE id='card'", [])
        .unwrap();
    assert!(store
        .board_stage_action("card", revision, StageAction::EditPlan("No".into()))
        .is_err());
    assert!(!dir.path().join("task-board/card/plan-2.md").exists());
    conn.execute(
        "UPDATE task_board_cards SET archived=0,column_id='backlog' WHERE id='card'",
        [],
    )
    .unwrap();
    assert!(store
        .board_stage_action("card", revision, StageAction::RequestChanges("No".into()))
        .is_err());
    assert!(!dir.path().join("task-board/card/answers-1.md").exists());
}

#[test]
fn concurrent_owner_plan_edits_accept_one_revision_and_publish_one_new_version() {
    let (dir, store) = gate();
    let revision = store.board_owner_review("card").unwrap().card.updated_at;
    let path = store.database_path().to_owned();
    drop(store);
    let barrier = std::sync::Arc::new(std::sync::Barrier::new(2));
    let handles: Vec<_> = ["First edit", "Second edit"]
        .into_iter()
        .map(|body| {
            let path = path.clone();
            let barrier = barrier.clone();
            std::thread::spawn(move || {
                let mut store = Store::open_desktop(&path).unwrap();
                barrier.wait();
                store.board_stage_action("card", revision, StageAction::EditPlan(body.into()))
            })
        })
        .collect();
    let results: Vec<_> = handles
        .into_iter()
        .map(|handle| handle.join().unwrap())
        .collect();
    assert_eq!(results.iter().filter(|result| result.is_ok()).count(), 1);
    let store = Store::open_desktop(&path).unwrap();
    assert_eq!(
        store
            .board_stage_artifacts("card")
            .unwrap()
            .iter()
            .filter(|meta| meta.kind == "plan")
            .count(),
        2
    );
    assert!(!dir.path().join("task-board/card/plan-3.md").exists());
}

#[test]
fn read_only_owner_review_keeps_database_bytes_and_refuses_every_mutation() {
    let (dir, store) = gate();
    let path = store.database_path().to_owned();
    let revision = store.board_owner_review("card").unwrap().card.updated_at;
    drop(store);
    let before = std::fs::read(&path).unwrap();
    let mut store = Store::read_desktop(&path).unwrap();
    assert_eq!(store.board_owner_review("card").unwrap().plan, "Plan");
    for action in [
        StageAction::EditPlan("No".into()),
        StageAction::RequestChanges("No".into()),
        StageAction::Answer {
            answers: vec![],
            note: "No".into(),
        },
    ] {
        assert!(store.board_stage_action("card", revision, action).is_err());
    }
    drop(store);
    assert_eq!(std::fs::read(path).unwrap(), before);
    assert!(!dir.path().join("task-board/card/plan-2.md").exists());
    assert!(!dir.path().join("task-board/card/answers-1.md").exists());
}
