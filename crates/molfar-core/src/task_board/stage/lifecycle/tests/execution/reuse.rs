use super::super::{fixtures::choice, owner::gate};
use super::fixtures::*;
use crate::{
    store::Store,
    task_board::stage::{agent::AgentStage, lifecycle::types::SessionPlan},
};

/// Writes a session's queue the way another window would, outside this store's cache.
fn queue(store: &Store, session: &str, draft: Option<&str>) {
    let other = Store::open_desktop(store.database_path()).unwrap();
    let native = other.resolve_session_id(session).unwrap();
    let mut state = other.follow_ups(native).unwrap();
    state.revision += 1;
    state.draft = draft.map(|text| crate::follow_up::Message {
        id: "typed-by-the-user".into(),
        text: text.into(),
        ..Default::default()
    });
    other.save_follow_ups(native, &state).unwrap();
}

/// A finished run's session as the GUI leaves it: its queued prompt was sent.
fn sent(store: &Store, session: &str) {
    queue(store, session, None);
}

fn accept(store: &mut Store, run: &str, stage: AgentStage) -> SessionPlan {
    let card = store.board_claim_next_stage().unwrap().unwrap();
    assert_eq!(card.column_id, stage.id());
    store
        .board_accept_stage("card", card.updated_at, run, &choice())
        .unwrap();
    store.board_stage_session_plan(run).unwrap()
}

fn sql(store: &Store, statement: &str) {
    rusqlite::Connection::open(store.database_path())
        .unwrap()
        .execute_batch(statement)
        .unwrap();
}

const SERIOUS: &str = "<<<MOLFAR:review>>>Verdict: CHANGES_REQUESTED\n\n## F1 [major] Race\nFile: src/a.rs:1\nFix it.<<<END:review>>>";

#[test]
fn rework_continues_the_build_session_while_reviews_start_fresh() {
    let (_dir, mut store) = gate();
    approve(&mut store);
    assert_eq!(
        accept(&mut store, "implement", AgentStage::Implement),
        SessionPlan::Fresh
    );
    sql(
        &store,
        "DELETE FROM task_board_stage_runs WHERE id='implement'",
    );
    sql(
        &store,
        "UPDATE task_board_cards SET run_state='queued' WHERE id='card'",
    );
    finish(
        &mut store,
        "implement",
        AgentStage::Implement,
        "abc123",
        "h1",
        REPORT,
    );
    sent(&store, "board-implement");

    assert_eq!(
        accept(&mut store, "review", AgentStage::CodeReview),
        SessionPlan::Fresh
    );
    sql(
        &store,
        "DELETE FROM task_board_stage_runs WHERE id='review'",
    );
    sql(
        &store,
        "UPDATE task_board_cards SET run_state='queued' WHERE id='card'",
    );
    finish(
        &mut store,
        "review",
        AgentStage::CodeReview,
        "h1",
        "h1",
        SERIOUS,
    );

    assert_eq!(
        accept(&mut store, "rework", AgentStage::Rework),
        SessionPlan::Reuse {
            session: "board-implement".into(),
            compact: false
        }
    );
}

#[test]
fn a_full_context_compacts_and_a_changed_agent_or_plan_starts_fresh() {
    let (_dir, mut store) = gate();
    approve(&mut store);
    finish(
        &mut store,
        "implement",
        AgentStage::Implement,
        "abc123",
        "h1",
        REPORT,
    );
    sent(&store, "board-implement");
    finish(
        &mut store,
        "review",
        AgentStage::CodeReview,
        "h1",
        "h1",
        SERIOUS,
    );
    let card = store.board_claim_next_stage().unwrap().unwrap();
    store
        .board_accept_stage("card", card.updated_at, "rework", &choice())
        .unwrap();

    let native = store.resolve_session_id("board-implement").unwrap();
    let full = crate::context::Usage {
        used: 160_000,
        window: Some(200_000),
    };
    store.save_context_usage(native, &full).unwrap();
    assert_eq!(
        store.board_stage_session_plan("rework").unwrap(),
        SessionPlan::Reuse {
            session: "board-implement".into(),
            compact: true
        }
    );

    sql(
        &store,
        "UPDATE task_board_stage_runs SET model='other' WHERE id='implement'",
    );
    assert_eq!(
        store.board_stage_session_plan("rework").unwrap(),
        SessionPlan::Fresh
    );
    sql(&store, "UPDATE task_board_stage_runs SET model=(SELECT model FROM task_board_stage_runs WHERE id='rework') WHERE id='implement'");

    sql(
        &store,
        "UPDATE task_board_artifacts SET created_at=9223372036854775000 WHERE kind='plan'",
    );
    assert_eq!(
        store.board_stage_session_plan("rework").unwrap(),
        SessionPlan::Fresh
    );
}

#[test]
fn a_failed_build_run_or_an_unsent_draft_starts_fresh() {
    let (_dir, mut store) = gate();
    approve(&mut store);
    finish(
        &mut store,
        "implement",
        AgentStage::Implement,
        "abc123",
        "h1",
        REPORT,
    );
    finish(
        &mut store,
        "review",
        AgentStage::CodeReview,
        "h1",
        "h1",
        SERIOUS,
    );
    let card = store.board_claim_next_stage().unwrap().unwrap();
    store
        .board_accept_stage("card", card.updated_at, "rework", &choice())
        .unwrap();

    queue(&store, "board-implement", Some("half-written note"));
    assert_eq!(
        store.board_stage_session_plan("rework").unwrap(),
        SessionPlan::Fresh
    );
    sent(&store, "board-implement");
    assert!(matches!(
        store.board_stage_session_plan("rework").unwrap(),
        SessionPlan::Reuse { .. }
    ));
    sql(
        &store,
        "UPDATE task_board_stage_runs SET status='failed' WHERE id='implement'",
    );
    assert_eq!(
        store.board_stage_session_plan("rework").unwrap(),
        SessionPlan::Fresh
    );
}
