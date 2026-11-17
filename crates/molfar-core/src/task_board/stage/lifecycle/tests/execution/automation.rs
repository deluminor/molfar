use super::super::owner::gate;
use super::fixtures::*;
use crate::task_board::stage::agent::AgentStage;

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
    assert!(card.last_error.unwrap().starts_with("Stopped — blocked: "));
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
