use crate::store::Store;
use rusqlite::Connection;

#[test]
fn archive_round_trip_preserves_card_and_rejects_stale_revision() {
    let mut store = Store::open_desktop(std::path::Path::new(":memory:")).unwrap();
    seed(&store.conn, "idle", None);
    let before = store
        .board_snapshot(None, false, None)
        .unwrap()
        .cards
        .remove(0);
    let archived = store.board_set_archived("card", 1, true).unwrap();
    assert!(archived.archived);
    assert!(archived.updated_at > before.updated_at);
    assert_eq!(archived.description, before.description);
    assert_eq!(archived.column_id, before.column_id);
    assert_eq!(archived.run_state, before.run_state);
    assert!(store
        .board_snapshot(None, false, None)
        .unwrap()
        .cards
        .is_empty());
    assert!(store.board_set_archived("card", 1, false).is_err());
    let restored = store
        .board_set_archived("card", archived.updated_at, false)
        .unwrap();
    assert!(!restored.archived);
    assert!(restored.updated_at > archived.updated_at);
    assert!(store
        .board_snapshot(None, false, Some("card"))
        .unwrap()
        .runs
        .is_empty());
    assert!(store.board_set_archived("missing", 1, true).is_err());
}

#[test]
fn archive_refuses_running_and_queued_cards_without_changes() {
    for (state, queued) in [("running", None), ("idle", Some(3))] {
        let mut store = Store::open_desktop(std::path::Path::new(":memory:")).unwrap();
        seed(&store.conn, state, queued);
        let before = store.board_snapshot(None, false, None).unwrap().cards;
        assert!(store.board_set_archived("card", 1, true).is_err());
        assert_eq!(
            store.board_snapshot(None, false, None).unwrap().cards,
            before
        );
    }
}

fn seed(conn: &Connection, state: &str, queued: Option<i64>) {
    conn.execute("INSERT INTO task_board_cards(id,number,project_cwd,title,description,acceptance_criteria,column_id,run_state,position,overrides_json,archived,created_at,updated_at,queued_at) VALUES('card',1,'/project','Title','Description','Criteria','backlog',?1,1,'{}',0,1,1,?2)", rusqlite::params![state,queued]).unwrap();
}
