use crate::store::Store;
use rusqlite::{params, Connection};
use std::path::Path;

fn fixture(path: &Path, board: bool) {
    let conn = Connection::open(path).unwrap();
    conn.execute_batch(include_str!("../store/shared_schema.sql"))
        .unwrap();
    if !board {
        return;
    }
    super::schema::ensure_tables(&conn).unwrap();
    for (id, number, project, column, archived) in [
        ("review", 1, "/one", "final_review", false),
        ("backlog", 2, "/two", "backlog", false),
        ("future", 3, "/one", "future_column", false),
        ("archived", 4, "/one", "done", true),
    ] {
        conn.execute(
            "INSERT INTO task_board_cards(id,number,project_cwd,title,description,acceptance_criteria,column_id,run_state,position,overrides_json,delivery_json,archived,created_at,updated_at,last_error,worktree_path) VALUES(?1,?2,?3,?1,'Description','Criteria',?4,'running',1,'{\"future\":true}','{\"url\":\"preserve\"}',?5,100,200,'Saved error','/retained')",
            params![id,number,project,column,archived],
        ).unwrap();
    }
    conn.execute_batch(
        "INSERT INTO task_board_stage_runs(id,card_id,stage,attempt,session_id,harness,model,settings_json,runtime_mode,template_version,dispatch,status,fingerprint_before,started_at) VALUES('run','review','code_review',2,'original-session','codex','gpt','{\"future\":true}','auto',1,'turn_submitted','running','fingerprint',10);
         INSERT INTO task_board_artifacts(id,card_id,kind,version,source,stage_run_id,created_at) VALUES('artifact','review','plan',3,'user','run',20);
         INSERT INTO task_board_settings(id,json) VALUES(1,'{\"future\":{\"keep\":true},\"maxConcurrentStages\":3}');"
    ).unwrap();
}

#[test]
fn fresh_board_is_empty_without_creating_defaults() {
    let store = Store::open_desktop(Path::new(":memory:")).unwrap();
    let snapshot = store.board_snapshot(None, false, None).unwrap();
    assert!(snapshot.cards.is_empty());
    assert!(snapshot.selected.is_none());
    assert!(snapshot.settings_json.is_none());
    assert!(snapshot.runs.is_empty());
    assert!(snapshot.artifacts.is_empty());
}

#[test]
fn copied_board_preserves_source_states_and_metadata_without_writes() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("molfar.db");
    fixture(&path, true);
    let before = std::fs::read(&path).unwrap();
    for _ in 0..2 {
        let store = Store::read_desktop(&path).unwrap();
        let snapshot = store.board_snapshot(None, false, Some("review")).unwrap();
        assert_eq!(
            snapshot
                .cards
                .iter()
                .map(|c| c.id.as_str())
                .collect::<Vec<_>>(),
            vec!["backlog", "review", "future"]
        );
        assert_eq!(snapshot.selected.as_deref(), Some("review"));
        let card = snapshot.cards.iter().find(|c| c.id == "review").unwrap();
        assert_eq!(card.number, 1);
        assert_eq!(card.column_id, "final_review");
        assert_eq!(card.run_state, "running");
        assert_eq!(card.description, "Description");
        assert_eq!(card.acceptance_criteria, "Criteria");
        assert_eq!(card.overrides_json, "{\"future\":true}");
        assert_eq!(
            card.delivery_json.as_deref(),
            Some("{\"url\":\"preserve\"}")
        );
        assert_eq!(card.last_error.as_deref(), Some("Saved error"));
        assert_eq!(card.worktree_path.as_deref(), Some("/retained"));
        assert_eq!((card.created_at, card.updated_at), (100, 200));
        assert_eq!(
            snapshot.runs[0].fingerprint_before.as_deref(),
            Some("fingerprint")
        );
        assert_eq!(
            snapshot.runs[0].session_id.as_deref(),
            Some("original-session")
        );
        assert_eq!(snapshot.runs[0].settings_json, "{\"future\":true}");
        assert_eq!(snapshot.artifacts[0].id, "artifact");
        assert_eq!(snapshot.artifacts[0].version, 3);
        assert_eq!(
            snapshot.settings_json.as_deref(),
            Some("{\"future\":{\"keep\":true},\"maxConcurrentStages\":3}")
        );
    }
    assert_eq!(std::fs::read(&path).unwrap(), before);
}

#[test]
fn project_archive_and_selection_filters_never_cross_card_details() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("molfar.db");
    fixture(&path, true);
    let store = Store::open_desktop(&path).unwrap();
    let snapshot = store
        .board_snapshot(Some("/two"), false, Some("review"))
        .unwrap();
    assert_eq!(snapshot.cards.len(), 1);
    assert_eq!(snapshot.selected.as_deref(), Some("backlog"));
    assert!(snapshot.runs.is_empty());
    assert!(snapshot.artifacts.is_empty());
    let snapshot = store.board_snapshot(Some("/one"), true, None).unwrap();
    assert_eq!(snapshot.cards.len(), 1);
    assert_eq!(snapshot.selected.as_deref(), Some("archived"));
    assert!(snapshot.cards[0].archived);
    assert!(store
        .board_snapshot(Some("/one' OR 1=1 --"), false, None)
        .unwrap()
        .cards
        .is_empty());
}

#[test]
fn existing_database_without_board_remains_unchanged_and_unavailable() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("molfar.db");
    fixture(&path, false);
    let before = std::fs::read(&path).unwrap();
    let store = Store::open_desktop(&path).unwrap();
    let error = store.board_snapshot(None, false, None).unwrap_err();
    assert!(error.contains("Cannot read Task Board"));
    assert!(error.contains("no such table"));
    drop(store);
    assert_eq!(std::fs::read(&path).unwrap(), before);
}

#[test]
fn incompatible_existing_board_reports_error_without_schema_repair() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("molfar.db");
    fixture(&path, true);
    let conn = Connection::open(&path).unwrap();
    conn.execute_batch("ALTER TABLE task_board_stage_runs DROP COLUMN fingerprint_before")
        .unwrap();
    drop(conn);
    let before = std::fs::read(&path).unwrap();
    let store = Store::open_desktop(&path).unwrap();
    assert!(store
        .board_snapshot(None, false, Some("review"))
        .unwrap_err()
        .contains("fingerprint_before"));
    drop(store);
    assert_eq!(std::fs::read(&path).unwrap(), before);
}
