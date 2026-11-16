use super::{super::fixtures::fixture, gate};
use crate::{
    store::Store,
    task_board::stage::{lifecycle::types::StageAction, owner::types::TaskEdit},
};
use rusqlite::Connection;

fn card(store: &Store) -> crate::task_board::types::Card {
    store.board_card("card").unwrap()
}

fn edit(title: &str, base_ref: Option<Option<String>>) -> StageAction {
    StageAction::EditTask(TaskEdit {
        title: title.into(),
        description: "  New description  ".into(),
        acceptance_criteria: " Works ".into(),
        base_ref,
    })
}

#[test]
fn backlog_edit_updates_fields_base_and_writes_a_new_task_version() {
    let (_dir, mut store) = fixture();
    let before = card(&store).updated_at;

    store
        .board_stage_action(
            "card",
            before,
            edit(" Renamed ", Some(Some(" develop ".into()))),
        )
        .unwrap();

    let edited = card(&store);
    assert_eq!(
        (
            edited.title.as_str(),
            edited.description.as_str(),
            edited.acceptance_criteria.as_str()
        ),
        ("Renamed", "New description", "Works")
    );
    assert_eq!(edited.base_ref.as_deref(), Some("develop"));
    assert_eq!(
        (edited.column_id.as_str(), edited.run_state.as_str()),
        ("backlog", "idle")
    );
    assert!(edited.updated_at > before);
    let task = store
        .board_latest_artifact("card", "task")
        .unwrap()
        .unwrap();
    assert!(task.starts_with("# #1 Renamed\n\n- Project: /project\n- Base branch: develop"));
    assert!(task.ends_with("## Acceptance criteria\n\nWorks"));

    store
        .board_stage_action("card", edited.updated_at, edit("Again", Some(None)))
        .unwrap();
    assert_eq!(card(&store).base_ref, None);
    assert!(store
        .board_stage_artifact("card", "task", 1)
        .unwrap()
        .contains("Renamed"));
    assert!(store
        .board_latest_artifact("card", "task")
        .unwrap()
        .unwrap()
        .contains("(project default)"));
}

#[test]
fn plan_approval_edit_keeps_base_and_refuses_base_changes() {
    let (_dir, mut store) = gate();
    let revision = card(&store).updated_at;

    let refused =
        store.board_stage_action("card", revision, edit("Plan", Some(Some("main".into()))));
    assert_eq!(
        refused.unwrap_err(),
        "The base branch is fixed once the card has started."
    );
    assert_eq!(card(&store).updated_at, revision);
    let task_before = store.board_latest_artifact("card", "task").unwrap();
    let base = card(&store).base_ref;

    store
        .board_stage_action("card", revision, edit("Plan", None))
        .unwrap();
    let edited = card(&store);
    assert_eq!(
        (edited.title.as_str(), edited.column_id.as_str()),
        ("Plan", "plan_approval")
    );
    assert_eq!(edited.base_ref, base);
    assert_ne!(
        store.board_latest_artifact("card", "task").unwrap(),
        task_before
    );
    store
        .board_stage_action("card", edited.updated_at, StageAction::ApprovePlan)
        .unwrap();
    let inputs = store.board_stage_inputs("card").unwrap();
    assert!(inputs[0].body.starts_with("# #1 Plan"));
}

#[test]
fn edit_refuses_stale_invalid_running_and_archived_cards_without_writes() {
    let (dir, mut store) = fixture();
    let revision = card(&store).updated_at;

    assert!(store
        .board_stage_action("card", revision - 1, edit("X", None))
        .unwrap_err()
        .starts_with("conflict:"));
    assert!(store
        .board_stage_action("card", revision, edit("   ", None))
        .unwrap_err()
        .contains("Title is required"));
    let conn = Connection::open(dir.path().join("molfar.db")).unwrap();
    for (state, archived) in [("running", 0), ("idle", 1)] {
        conn.execute(
            "UPDATE task_board_cards SET run_state=?1,archived=?2 WHERE id='card'",
            rusqlite::params![state, archived],
        )
        .unwrap();
        assert!(
            store
                .board_stage_action("card", revision, edit("X", None))
                .is_err(),
            "{state}/{archived}"
        );
    }

    assert_eq!(card(&store).title, "A card");
    assert!(store
        .board_latest_artifact("card", "task")
        .unwrap()
        .is_none());
}
