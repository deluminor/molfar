use super::super::owner::gate;
use super::fixtures::*;
use crate::task_board::stage::{agent::AgentStage, lifecycle::types::StageAction};

const PARTIAL: &str =
    "<<<MOLFAR:impl_report>>>Status: partial\n## Remaining work\nStage 3<<<END:impl_report>>>";
const BLOCKED: &str =
    "<<<MOLFAR:impl_report>>>Status: blocked\n## Summary\nNo access<<<END:impl_report>>>";
const SERIOUS: &str = "<<<MOLFAR:review>>>Verdict: CHANGES_REQUESTED\n\n## Acceptance criteria\n- AC-1: not met\n\n## F1 [blocking] Missing stage\nFile: src/a.rs:1\nImplement it.\n\n## F2 [minor] Naming\nFile: src/b.rs:2\nRename.\n\n## F3 [nit] Spacing\nOptional.<<<END:review>>>";

fn card(store: &crate::store::Store) -> crate::task_board::types::Card {
    store
        .board_snapshot(None, false, Some("card"))
        .unwrap()
        .cards
        .remove(0)
}

fn run_status(store: &crate::store::Store, run: &str) -> String {
    store.board_stage_context(run).unwrap().unwrap().run.status
}

#[test]
fn partial_runs_continue_in_place_until_the_streak_limit_then_fail() {
    let (_dir, mut store) = gate();
    approve(&mut store);

    for (index, run) in ["one", "two", "three"].into_iter().enumerate() {
        let head = format!("head-{index}");
        let next = format!("head-{}", index + 1);
        let session = prepare(&mut store, run, AgentStage::Implement, &head);
        assert_eq!(store.board_stage_continuation(run).unwrap(), index as i64);
        let output = receipt(
            &mut store,
            run,
            session,
            AgentStage::Implement,
            PARTIAL,
            &next,
        );
        let effect = store.board_finish_stage(run, &output).unwrap();

        assert!(effect.notice.is_none());
        assert_eq!(run_status(&store, run), "partial");
        let card = card(&store);
        assert_eq!(
            (card.column_id.as_str(), card.run_state.as_str()),
            ("implement", "queued")
        );
    }
    assert_eq!(
        store
            .board_stage_inputs("card")
            .unwrap()
            .last()
            .unwrap()
            .kind,
        "impl_report"
    );

    let session = prepare(&mut store, "four", AgentStage::Implement, "head-3");
    assert_eq!(store.board_stage_continuation("four").unwrap(), 3);
    let output = receipt(
        &mut store,
        "four",
        session,
        AgentStage::Implement,
        PARTIAL,
        "abc123",
    );
    let effect = store.board_finish_stage("four", &output).unwrap();

    assert!(effect.notice.unwrap().body.contains("4 runs in a row"));
    assert_eq!(run_status(&store, "four"), "failed");
    let failed = card(&store);
    assert_eq!(
        (failed.column_id.as_str(), failed.run_state.as_str()),
        ("implement", "failed")
    );
    assert_eq!(
        store
            .board_stage_artifacts("card")
            .unwrap()
            .iter()
            .filter(|meta| meta.kind == "impl_report")
            .count(),
        4
    );

    store
        .board_stage_action("card", failed.updated_at, StageAction::Retry(None))
        .unwrap();
    prepare(&mut store, "five", AgentStage::Implement, "abc123");
    assert_eq!(store.board_stage_continuation("five").unwrap(), 0);
}

#[test]
fn blocked_report_fails_the_stage_with_an_actionable_error() {
    let (_dir, mut store) = gate();
    approve(&mut store);
    let session = prepare(&mut store, "implement", AgentStage::Implement, "abc123");
    let output = receipt(
        &mut store,
        "implement",
        session,
        AgentStage::Implement,
        BLOCKED,
        "one",
    );

    store.board_finish_stage("implement", &output).unwrap();

    let card = card(&store);
    assert_eq!(card.run_state, "failed");
    assert!(card.last_error.unwrap().contains("blocked"));
}

#[test]
fn serious_review_findings_rework_automatically_twice_then_reach_final_review() {
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

    for cycle in 1..=2 {
        let head = format!("h{cycle}");
        let next = format!("h{}", cycle + 1);
        finish(
            &mut store,
            &format!("review-{cycle}"),
            AgentStage::CodeReview,
            &head,
            &head,
            SERIOUS,
        );
        let card = card(&store);
        assert_eq!(
            (card.column_id.as_str(), card.run_state.as_str()),
            ("rework", "queued")
        );
        assert_eq!(card.rework_cycle, cycle);

        let brief = store
            .board_stage_inputs("card")
            .unwrap()
            .into_iter()
            .find(|input| input.kind == "rework_brief")
            .unwrap();
        assert!(brief.body.contains("Missing stage") && brief.body.contains("Naming"));
        assert!(!brief.body.contains("Spacing"));
        let meta = store.board_stage_artifacts("card").unwrap();
        assert!(meta
            .iter()
            .any(|meta| meta.kind == "rework_brief" && meta.source == "engine"));

        finish(
            &mut store,
            &format!("rework-{cycle}"),
            AgentStage::Rework,
            &head,
            &next,
            REPORT,
        );
    }

    finish(
        &mut store,
        "review-3",
        AgentStage::CodeReview,
        "h3",
        "h3",
        SERIOUS,
    );
    let card = card(&store);
    assert_eq!(
        (card.column_id.as_str(), card.run_state.as_str()),
        ("final_review", "idle")
    );
    assert_eq!(card.rework_cycle, 2);
}

#[test]
fn only_minor_findings_go_straight_to_final_review() {
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
        REVIEW,
    );

    let card = card(&store);
    assert_eq!(card.column_id, "final_review");
    assert_eq!(card.rework_cycle, 0);
}
