use super::fixtures::{accept, fixture};
use crate::task_board::stage::lifecycle::types::StageAction;
use rusqlite::Connection;
use std::collections::HashSet;

#[test]
fn grill_lifecycle_orphan_claim_is_interrupted_without_replay_and_can_retry() {
    let (_dir, mut store) = fixture();
    store
        .board_stage_action("card", 1, StageAction::Start)
        .unwrap();
    store.board_claim_next_stage().unwrap().unwrap();
    let mut active = HashSet::new();
    active.insert("card".into());
    assert!(store
        .board_reconcile_orphan_claims(&active)
        .unwrap()
        .is_empty());
    assert_eq!(
        store
            .board_reconcile_orphan_claims(&HashSet::new())
            .unwrap()
            .len(),
        1
    );
    assert!(store.sessions().unwrap().is_empty());
    let card = store
        .board_snapshot(None, false, None)
        .unwrap()
        .cards
        .remove(0);
    assert_eq!(card.run_state, "failed");
    store
        .board_stage_action("card", card.updated_at, StageAction::Retry(None))
        .unwrap();
    assert_eq!(store.board_claim_next_stage().unwrap().unwrap().id, "card");
}

#[test]
fn grill_lifecycle_stall_is_once_per_run_durable_and_does_not_cancel() {
    let (_dir, mut store) = fixture();
    let ctx = accept(&mut store, "run-one");
    let notices = store
        .board_take_stall_notices(ctx.run.started_at as u64 + 45 * 60_000)
        .unwrap();
    assert_eq!(notices.len(), 1);
    assert!(store
        .board_take_stall_notices(ctx.run.started_at as u64 + 46 * 60_000)
        .unwrap()
        .is_empty());
    let reopened = crate::store::Store::open_desktop(store.database_path()).unwrap();
    assert!(reopened
        .board_take_stall_notices(ctx.run.started_at as u64 + 47 * 60_000)
        .unwrap()
        .is_empty());
    assert!(store.board_stage_is_current("run-one").unwrap());
}

#[test]
fn stage_concurrency_counts_all_running_and_claims_other_agent_stages() {
    let (_dir, mut store) = fixture();
    let conn = Connection::open(store.database_path()).unwrap();
    conn.execute(
        "INSERT INTO task_board_settings(id,json) VALUES(1,'{\"maxConcurrentStages\":1}')",
        [],
    )
    .unwrap();
    conn.execute("INSERT INTO task_board_cards(id,number,project_cwd,title,description,column_id,run_state,position,created_at,updated_at) VALUES('other',2,'/project','Other','Other','implement','running',1,1,1)",[]).unwrap();
    store
        .board_stage_action("card", 1, StageAction::Start)
        .unwrap();
    assert!(store.board_claim_next_stage().unwrap().is_none());
    conn.execute(
        "UPDATE task_board_cards SET run_state='queued' WHERE id='other'",
        [],
    )
    .unwrap();
    assert_eq!(store.board_claim_next_stage().unwrap().unwrap().id, "other");
    let other = store
        .board_snapshot(None, false, None)
        .unwrap()
        .cards
        .into_iter()
        .find(|c| c.id == "other")
        .unwrap();
    assert_eq!(other.run_state, "running");
    assert!(store.board_claim_next_stage().unwrap().is_none());
}

#[test]
fn grill_lifecycle_attention_excludes_active_manual_gate_and_session_input_badges() {
    let (_dir, store) = fixture();
    let conn = Connection::open(store.database_path()).unwrap();
    conn.execute(
        "UPDATE task_board_cards SET column_id='final_review',run_state='running' WHERE id='card'",
        [],
    )
    .unwrap();
    assert_eq!(store.board_attention().unwrap(), 0);
    conn.execute(
        "UPDATE task_board_cards SET run_state='idle' WHERE id='card'",
        [],
    )
    .unwrap();
    assert_eq!(store.board_attention().unwrap(), 1);
    conn.execute("UPDATE task_board_cards SET archived=1 WHERE id='card'", [])
        .unwrap();
    assert_eq!(store.board_attention().unwrap(), 0);
}
