use super::super::{fixtures::choice, owner::gate};
use super::fixtures::*;
use crate::{
    context::Usage,
    provider::{supports_compact, Kind},
    store::Store,
    task_board::stage::{agent::AgentStage, lifecycle::types::SessionPlan},
};

const PARTIAL: &str =
    "<<<MOLFAR:impl_report>>>Status: partial\n## Remaining work\nStage 3<<<END:impl_report>>>";

fn sql(store: &Store, statement: &str) {
    rusqlite::Connection::open(store.database_path())
        .unwrap()
        .execute_batch(statement)
        .unwrap();
}

fn plan_with(store: &Store, session: i64, usage: Option<Usage>) -> SessionPlan {
    let usage = usage.unwrap_or(Usage {
        used: 0,
        window: None,
    });
    store.save_context_usage(session, &usage).unwrap();
    store.board_stage_session_plan("next").unwrap()
}

#[test]
fn every_harness_reuses_its_session_and_resets_a_full_context_by_its_own_means() {
    let (_dir, mut store) = gate();
    approve(&mut store);
    finish(
        &mut store,
        "implement",
        AgentStage::Implement,
        "abc123",
        "h1",
        PARTIAL,
    );
    super::reuse::sent(&store, "board-implement");
    let card = store.board_claim_next_stage().unwrap().unwrap();
    store
        .board_accept_stage("card", card.updated_at, "next", &choice())
        .unwrap();
    let session = store.resolve_session_id("board-implement").unwrap();
    let reuse = |compact| SessionPlan::Reuse {
        session: "board-implement".into(),
        compact,
    };
    let usage = |used| {
        Some(Usage {
            used,
            window: Some(200_000),
        })
    };

    for kind in Kind::ALL {
        sql(
            &store,
            &format!("UPDATE task_board_stage_runs SET harness='{}'", kind.id()),
        );
        assert_eq!(plan_with(&store, session, None), reuse(false), "{kind:?}");
        assert_eq!(
            plan_with(&store, session, usage(100_000)),
            reuse(false),
            "{kind:?}"
        );

        let full = plan_with(&store, session, usage(150_000));
        let expected = if supports_compact(kind) {
            reuse(true)
        } else {
            SessionPlan::Reset
        };
        assert_eq!(full, expected, "{kind:?}");
    }
}
