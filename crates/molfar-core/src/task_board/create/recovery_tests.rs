use super::tests::{input, project};
use crate::store::Store;
use rusqlite::Connection;
use std::sync::{Arc, Barrier};

#[test]
fn board_creation_concurrent_same_and_distinct_ids_have_one_card_and_artifact_each() {
    let dir = tempfile::tempdir().unwrap();
    let cwd = project(&dir.path().join("project"));
    let path = dir.path().join("molfar.db");
    drop(Store::open_desktop(&path).unwrap());
    let barrier = Arc::new(Barrier::new(4));
    let threads = (0..4)
        .map(|index| {
            let path = path.clone();
            let cwd = cwd.clone();
            let barrier = barrier.clone();
            std::thread::spawn(move || {
                let mut store = Store::open_desktop(&path).unwrap();
                let mut request = input(&cwd);
                if index > 1 {
                    request.id = format!("card-{index}");
                }
                barrier.wait();
                store.board_create(&request, &[cwd]).unwrap()
            })
        })
        .collect::<Vec<_>>();
    let cards = threads
        .into_iter()
        .map(|thread| thread.join().unwrap())
        .collect::<Vec<_>>();
    assert_eq!(cards[0], cards[1]);
    let store = Store::open_desktop(&path).unwrap();
    let snapshot = store.board_snapshot(None, false, None).unwrap();
    assert_eq!(snapshot.cards.len(), 3);
    for card in snapshot.cards {
        let snapshot = store.board_snapshot(None, false, Some(&card.id)).unwrap();
        assert_eq!(snapshot.artifacts.len(), 1);
        assert_eq!(snapshot.artifacts[0].version, 1);
    }
}

#[test]
fn board_creation_registers_matching_orphan_without_overwriting_unknown_artifacts() {
    let dir = tempfile::tempdir().unwrap();
    let cwd = project(&dir.path().join("project"));
    let path = dir.path().join("molfar.db");
    let mut store = Store::open_desktop(&path).unwrap();
    let card = store
        .board_create(&input(&cwd), std::slice::from_ref(&cwd))
        .unwrap();
    let artifact = dir.path().join("task-board/card-creation/task-1.md");
    let original = std::fs::read_to_string(&artifact).unwrap();
    let conn = Connection::open(&path).unwrap();
    conn.execute("DELETE FROM task_board_artifacts", [])
        .unwrap();
    assert_eq!(store.board_create(&input(&cwd), &[]).unwrap(), card);
    assert_eq!(std::fs::read_to_string(&artifact).unwrap(), original);
    conn.execute("DELETE FROM task_board_artifacts", [])
        .unwrap();
    std::fs::write(&artifact, "Unknown later content").unwrap();
    assert!(store
        .board_create(&input(&cwd), &[])
        .unwrap_err()
        .contains("not overwritten"));
    assert_eq!(
        std::fs::read_to_string(&artifact).unwrap(),
        "Unknown later content"
    );
    assert!(store
        .board_snapshot(None, false, None)
        .unwrap()
        .artifacts
        .is_empty());
}

#[test]
fn board_creation_leaves_existing_database_schema_untouched() {
    let dir = tempfile::tempdir().unwrap();
    let cwd = project(&dir.path().join("project"));
    let path = dir.path().join("molfar.db");
    let mut store = Store::open_desktop(&path).unwrap();
    let conn = Connection::open(&path).unwrap();
    conn.execute_batch("DROP TABLE task_board_cards;").unwrap();
    let before: i64 = conn
        .query_row("PRAGMA schema_version", [], |row| row.get(0))
        .unwrap();
    assert!(store.board_create(&input(&cwd), &[cwd]).is_err());
    let after: i64 = conn
        .query_row("PRAGMA schema_version", [], |row| row.get(0))
        .unwrap();
    assert_eq!(before, after);
    assert!(!dir.path().join("task-board").exists());
}

#[cfg(unix)]
#[test]
fn board_creation_refuses_symlink_artifact_directories_and_files() {
    use std::os::unix::fs::symlink;
    let dir = tempfile::tempdir().unwrap();
    let cwd = project(&dir.path().join("project"));
    let mut store = Store::open_desktop(&dir.path().join("molfar.db")).unwrap();
    let outside = dir.path().join("outside");
    std::fs::create_dir(&outside).unwrap();
    let base = dir.path().join("task-board");
    symlink(&outside, &base).unwrap();
    assert!(store
        .board_create(&input(&cwd), std::slice::from_ref(&cwd))
        .is_err());
    assert_eq!(std::fs::read_dir(&outside).unwrap().count(), 0);
    std::fs::remove_file(&base).unwrap();
    std::fs::create_dir(&base).unwrap();
    let card_dir = base.join("card-creation");
    symlink(&outside, &card_dir).unwrap();
    assert!(store.board_create(&input(&cwd), &[]).is_err());
    std::fs::remove_file(&card_dir).unwrap();
    std::fs::create_dir(&card_dir).unwrap();
    let outside_file = outside.join("untouched");
    std::fs::write(&outside_file, "preserve").unwrap();
    symlink(&outside_file, card_dir.join("task-1.md")).unwrap();
    assert!(store.board_create(&input(&cwd), &[]).is_err());
    assert_eq!(std::fs::read_to_string(outside_file).unwrap(), "preserve");
}
