use super::{super::super::*, fixtures::*};
use gpui::TestAppContext;
use molfar_core::{consumption::TokenCounts, task_board::stage::lifecycle::types::StageAction};
use std::collections::HashMap;

const FIXTURE_TOKENS: TokenCounts = TokenCounts {
    input: 1200,
    output: 80,
    cache_read: 1000,
    cache_write: 0,
};

#[gpui::test]
fn every_stage_run_records_one_ledger_entry_in_its_session(cx: &mut TestAppContext) {
    let fixture = super::super::fixtures::Fixture::new();
    let window = start(&fixture, cx);
    action(&fixture, window, StageAction::ApprovePlan, cx);
    gate(&fixture, "final_review", cx);

    let store = locked(&fixture.store).unwrap();
    let runs = store
        .board_snapshot(None, false, Some("card"))
        .unwrap()
        .runs;
    let mut runs_per_session = HashMap::<String, usize>::new();
    for run in &runs {
        *runs_per_session
            .entry(run.session_id.clone().unwrap())
            .or_default() += 1;
    }

    assert_eq!(runs.len(), 3, "{runs:?}");
    for (session, count) in runs_per_session {
        let native = store.resolve_session_id(&session).unwrap();
        let records = store.session_consumption(native).unwrap();
        assert_eq!(records.len(), count, "{session}: {records:?}");
        for record in records {
            assert_eq!(record.provider, "codex");
            assert_eq!(record.tokens, Some(FIXTURE_TOKENS));
            assert!(record.reported_at_ms >= record.started_at_ms);
            assert!(!record.source_key.starts_with("legacy:"));
        }
    }
}
