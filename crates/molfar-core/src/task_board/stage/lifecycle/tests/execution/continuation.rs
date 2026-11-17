use super::super::owner::gate;
use super::fixtures::*;
use crate::{
    store::Store,
    task_board::{
        stage::{agent::AgentStage, lifecycle::types::StageAction},
        types::Card,
    },
};

const PARTIAL: &str = "<<<MOLFAR:impl_report>>>Status: partial\n## Remaining work\nStage 3\n## Stop signal\nSession budget reached<<<END:impl_report>>>";

fn card(store: &Store) -> Card {
    store
        .board_snapshot(None, false, Some("card"))
        .unwrap()
        .cards
        .remove(0)
}

fn status(store: &Store, run: &str) -> String {
    store.board_stage_context(run).unwrap().unwrap().run.status
}

fn full(store: &Store, session: i64) {
    let usage = crate::context::Usage {
        used: 160_000,
        window: Some(200_000),
    };
    store.save_context_usage(session, &usage).unwrap();
}

/// One Implement turn that reports `partial`; `compacted` marks it as started after a compaction.
fn partial_turn(store: &mut Store, run: &str, index: usize, full_context: bool, compacted: bool) {
    let session = prepare(store, run, AgentStage::Implement, &format!("head-{index}"));
    if compacted {
        store.board_record_compaction(run).unwrap();
    }
    if full_context {
        full(store, session);
    }
    let output = receipt(
        store,
        run,
        session,
        AgentStage::Implement,
        PARTIAL,
        &format!("head-{}", index + 1),
    );
    store.board_finish_stage(run, &output).unwrap();
}

#[test]
fn a_self_declared_partial_keeps_the_stage_going_past_the_old_streak_limit() {
    let (_dir, mut store) = gate();
    approve(&mut store);

    for index in 0..8 {
        let run = format!("turn-{index}");
        partial_turn(&mut store, &run, index, false, false);
        assert_eq!(store.board_stage_continuation(&run).unwrap(), index as i64);
        assert_eq!(status(&store, &run), "partial");
        let card = card(&store);
        assert_eq!(
            (card.column_id.as_str(), card.run_state.as_str()),
            ("implement", "queued")
        );
        assert!(card.last_error.is_none());
    }

    finish(
        &mut store,
        "done",
        AgentStage::Implement,
        "head-8",
        "head-9",
        REPORT,
    );
    assert_eq!(card(&store).column_id, "code_review");
}

#[test]
fn a_looping_agent_is_stopped_by_the_turn_budget_and_retry_resets_it() {
    let (_dir, mut store) = gate();
    approve(&mut store);

    for index in 0..19 {
        partial_turn(&mut store, &format!("turn-{index}"), index, false, false);
        assert_eq!(card(&store).run_state, "queued");
    }
    partial_turn(&mut store, "turn-19", 19, false, false);

    let stopped = card(&store);
    assert_eq!(stopped.run_state, "failed");
    let error = stopped.last_error.unwrap();
    assert!(error.starts_with("Stopped — automatic turn budget: "));
    assert!(error.contains("20 agent turns"));
    assert_eq!(status(&store, "turn-19"), "failed");

    store
        .board_stage_action("card", stopped.updated_at, StageAction::Retry(None))
        .unwrap();
    partial_turn(&mut store, "retry", 20, false, false);
    assert_eq!(store.board_stage_continuation("retry").unwrap(), 0);
    assert_eq!(card(&store).run_state, "queued");
}

#[test]
fn a_full_context_after_three_compactions_stops_with_the_latest_report() {
    let (_dir, mut store) = gate();
    approve(&mut store);
    partial_turn(&mut store, "turn-a", 0, false, false);
    partial_turn(&mut store, "turn-b", 1, true, true);
    partial_turn(&mut store, "turn-c", 2, true, true);
    assert_eq!(store.board_streak_compactions("turn-c").unwrap(), 2);
    assert_eq!(card(&store).run_state, "queued", "compactions left");

    partial_turn(&mut store, "turn-d", 3, true, true);

    assert_eq!(store.board_streak_compactions("turn-d").unwrap(), 3);
    let stopped = card(&store);
    assert_eq!(stopped.run_state, "failed");
    assert_eq!(
        stopped.last_error.as_deref(),
        Some("Stopped — context compaction limit: Context compaction limit reached: 3 of 3 compactions used. Read the implementation report, then Retry to continue in a fresh session.")
    );
    let reports = store
        .board_stage_artifacts("card")
        .unwrap()
        .into_iter()
        .filter(|meta| meta.kind == "impl_report")
        .count();
    assert_eq!(reports, 4, "the stopping turn's report is kept");

    store
        .board_stage_action("card", stopped.updated_at, StageAction::Retry(None))
        .unwrap();
    partial_turn(&mut store, "retry", 4, true, false);
    assert_eq!(store.board_streak_compactions("retry").unwrap(), 0);
    assert_eq!(card(&store).run_state, "queued");
}

#[test]
fn three_compactions_with_room_left_in_the_context_keep_going() {
    let (_dir, mut store) = gate();
    approve(&mut store);
    for index in 0..3 {
        partial_turn(&mut store, &format!("turn-{index}"), index, false, true);
    }
    partial_turn(&mut store, "turn-3", 3, false, false);

    assert_eq!(store.board_streak_compactions("turn-3").unwrap(), 3);
    assert_eq!(card(&store).run_state, "queued");
}
