use crate::store::Store;

#[test]
fn scoped_card_reads_reject_foreign_missing_and_alias_targets_uniformly() {
    let store = Store::open_desktop(std::path::Path::new(":memory:")).unwrap();
    store.conn.execute("INSERT INTO task_board_cards(id,number,project_cwd,title,description,acceptance_criteria,column_id,run_state,position,overrides_json,archived,created_at,updated_at) VALUES('card',1,'/project','Title','Description','Criteria','backlog','idle',1,'{}',0,1,1)", []).unwrap();
    let allowed = vec!["/project".to_owned()];
    let card = store.board_scoped_card("card", &allowed).unwrap();
    assert_eq!(card.acceptance_criteria, "Criteria");
    let missing = store.board_scoped_card("missing", &allowed).unwrap_err();
    for projects in [
        vec![],
        vec!["/project/child".into()],
        vec!["/project/../project".into()],
    ] {
        assert_eq!(
            store.board_scoped_card("card", &projects).unwrap_err(),
            missing
        );
    }
    assert!(store
        .board_snapshot(None, false, Some("card"))
        .unwrap()
        .runs
        .is_empty());
}

#[test]
fn scoped_artifact_pages_bound_unicode_and_hide_foreign_metadata() {
    let directory = tempfile::tempdir().unwrap();
    let store = Store::open_desktop(&directory.path().join("state.db")).unwrap();
    store.conn.execute("INSERT INTO task_board_cards(id,number,project_cwd,title,description,acceptance_criteria,column_id,run_state,position,overrides_json,archived,created_at,updated_at) VALUES('card',1,'/project','Title','Description','Criteria','backlog','idle',1,'{}',0,1,1)", []).unwrap();
    store.conn.execute("INSERT INTO task_board_artifacts(id,card_id,kind,version,source,created_at) VALUES('artifact','card','task',1,'user',1)", []).unwrap();
    let base = store.board_artifact_base().unwrap().join("card");
    std::fs::create_dir_all(&base).unwrap();
    std::fs::write(base.join("task-1.md"), "🙂éabc").unwrap();
    let allowed = vec!["/project".into()];
    let page = store
        .board_scoped_artifact(
            "card",
            &allowed,
            &crate::task_board::types::ArtifactRead {
                kind: "task",
                version: 1,
                max_chars: 2,
                char_offset: 0,
            },
        )
        .unwrap();
    assert_eq!(page.body, "🙂é");
    assert_eq!(page.next_char_offset, Some(2));
    let page = store
        .board_scoped_artifact(
            "card",
            &allowed,
            &crate::task_board::types::ArtifactRead {
                kind: "task",
                version: 1,
                max_chars: 3,
                char_offset: 2,
            },
        )
        .unwrap();
    assert_eq!(page.body, "abc");
    assert_eq!(page.next_char_offset, None);
    assert!(store
        .board_scoped_artifact(
            "card",
            &allowed,
            &crate::task_board::types::ArtifactRead {
                kind: "task",
                version: 1,
                max_chars: 6001,
                char_offset: 0
            }
        )
        .is_err());
    assert!(store
        .board_scoped_artifact(
            "card",
            &allowed,
            &crate::task_board::types::ArtifactRead {
                kind: "task",
                version: 1,
                max_chars: 0,
                char_offset: 0
            }
        )
        .is_err());
    assert!(store
        .board_scoped_artifact(
            "card",
            &allowed,
            &crate::task_board::types::ArtifactRead {
                kind: "task",
                version: 1,
                max_chars: 1,
                char_offset: 6
            }
        )
        .is_err());
    let foreign = store
        .board_scoped_artifact(
            "card",
            &[],
            &crate::task_board::types::ArtifactRead {
                kind: "task",
                version: 1,
                max_chars: 2,
                char_offset: 0,
            },
        )
        .unwrap_err();
    let missing = store
        .board_scoped_artifact(
            "missing",
            &allowed,
            &crate::task_board::types::ArtifactRead {
                kind: "task",
                version: 1,
                max_chars: 2,
                char_offset: 0,
            },
        )
        .unwrap_err();
    assert_eq!(foreign, missing);
    assert!(store
        .board_scoped_artifact(
            "card",
            &allowed,
            &crate::task_board::types::ArtifactRead {
                kind: "../task",
                version: 1,
                max_chars: 2,
                char_offset: 0
            }
        )
        .is_err());
}

#[test]
fn scoped_listing_bounds_pages_and_checks_current_project_access() {
    let store = Store::open_desktop(std::path::Path::new(":memory:")).unwrap();
    for (id, number, project, archived) in [
        ("a", 1, "/project", 0),
        ("b", 2, "/other", 0),
        ("c", 3, "/project", 0),
        ("d", 4, "/project", 1),
    ] {
        store.conn.execute("INSERT INTO task_board_cards(id,number,project_cwd,title,description,acceptance_criteria,column_id,run_state,position,overrides_json,archived,created_at,updated_at) VALUES(?1,?2,?3,'Title','','','backlog','idle',1,'{}',?4,1,1)", rusqlite::params![id,number,project,archived]).unwrap();
    }
    let allowed = vec!["/project".into()];
    let first = store
        .board_scoped_list("/project", &allowed, false, 0, 1)
        .unwrap();
    assert_eq!(first.len(), 1);
    assert_eq!(first[0].id, "a");
    let second = store
        .board_scoped_list("/project", &allowed, false, 1, 1)
        .unwrap();
    assert_eq!(second[0].id, "c");
    assert!(store
        .board_scoped_list("/project", &allowed, false, 2, 1)
        .unwrap()
        .is_empty());
    assert_eq!(
        store
            .board_scoped_list("/project", &allowed, true, 0, 100)
            .unwrap()[0]
            .id,
        "d"
    );
    for limit in [0, 101] {
        assert!(store
            .board_scoped_list("/project", &allowed, false, 0, limit)
            .is_err());
    }
    assert!(store
        .board_scoped_list("/project", &[], false, 1, 1)
        .is_err());
    assert!(store
        .board_scoped_list("/project/../project", &allowed, false, 0, 1)
        .is_err());
}
