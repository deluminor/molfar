use super::super::owner::gate;
use super::fixtures::*;
use crate::{
    store::Store,
    task_board::stage::{agent::AgentStage, lifecycle::storage::outcome::budget_spent},
};

const PARTIAL: &str =
    "<<<MOLFAR:impl_report>>>Status: partial\n## Remaining work\nStage 3<<<END:impl_report>>>";

fn spent(store: &Store) -> bool {
    let conn = rusqlite::Connection::open(store.database_path()).unwrap();
    budget_spent(&conn, "card").unwrap()
}

fn insert_runs(store: &Store, stage: &str, status: &str, count: i64) {
    let conn = rusqlite::Connection::open(store.database_path()).unwrap();
    for index in 0..count {
        conn.execute(
            "INSERT INTO task_board_stage_runs(id,card_id,stage,attempt,harness,model,settings_json,runtime_mode,template_version,dispatch,status,started_at) VALUES(?1,'card',?2,?3,'codex','gpt','{}','auto',4,'settled',?4,?5)",
            rusqlite::params![format!("old-{index}"), stage, index + 1, status, i64::MAX / 2 + index],
        )
        .unwrap();
    }
}

#[test]
fn ten_automatic_runs_stop_the_card_and_retry_gets_a_new_budget() {
    let (_dir, mut store) = gate();
    approve(&mut store);
    insert_runs(&store, "implement", "succeeded", 9);

    let session = prepare(&mut store, "tenth", AgentStage::Implement, "h0");
    assert!(spent(&store));
    let output = receipt(
        &mut store,
        "tenth",
        session,
        AgentStage::Implement,
        PARTIAL,
        "h1",
    );
    store.board_finish_stage("tenth", &output).unwrap();

    let stopped = store
        .board_snapshot(None, false, Some("card"))
        .unwrap()
        .cards
        .remove(0);
    assert_eq!(stopped.run_state, "failed");
    assert!(stopped
        .last_error
        .unwrap()
        .contains("Automatic budget used"));
    assert!(
        !spent(&store),
        "a stop that needs the user starts a new budget for Retry"
    );
}

#[test]
fn a_written_decision_resets_the_automatic_budget() {
    let (_dir, store) = gate();
    insert_runs(&store, "rework", "succeeded", 10);
    assert!(spent(&store));

    rusqlite::Connection::open(store.database_path())
        .unwrap()
        .execute(
            "INSERT INTO task_board_artifacts(id,card_id,kind,version,source,stage_run_id,created_at) VALUES('decision','card','rework_brief',1,'user',NULL,9223372036854775000)",
            [],
        )
        .unwrap();
    assert!(!spent(&store));
}
