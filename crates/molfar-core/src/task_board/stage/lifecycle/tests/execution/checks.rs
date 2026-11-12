use super::super::owner::gate;
use super::fixtures::*;
use crate::task_board::stage::agent::AgentStage;

fn card(store: &crate::store::Store) -> crate::task_board::types::Card {
    store
        .board_snapshot(None, false, Some("card"))
        .unwrap()
        .cards
        .remove(0)
}

#[test]
fn red_checks_send_the_card_back_twice_then_let_the_review_run() {
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
        let review = format!("review-{cycle}");
        prepare(&mut store, &review, AgentStage::CodeReview, &head);

        let effect = store
            .board_stage_checks_failed(&review, "`npm test` failed with exit code 1.")
            .unwrap()
            .unwrap();

        let moved = effect.card.unwrap();
        assert_eq!(
            (moved.column_id.as_str(), moved.run_state.as_str()),
            ("rework", "queued")
        );
        assert_eq!(moved.rework_cycle, cycle);
        let run = store.board_stage_context(&review).unwrap().unwrap().run;
        assert_eq!(run.status, "failed");
        let brief = store
            .board_stage_inputs("card")
            .unwrap()
            .into_iter()
            .find(|input| input.kind == "rework_brief")
            .unwrap();
        assert!(brief.body.contains("## Checks failed") && brief.body.contains("exit code 1"));
        assert!(store
            .board_stage_artifacts("card")
            .unwrap()
            .iter()
            .any(|meta| meta.kind == "rework_brief" && meta.source == "checks"));

        finish(
            &mut store,
            &format!("rework-{cycle}"),
            AgentStage::Rework,
            &head,
            &next,
            REPORT,
        );
    }

    prepare(&mut store, "review-3", AgentStage::CodeReview, "h3");
    assert!(store
        .board_stage_checks_failed("review-3", "still red")
        .unwrap()
        .is_none());
    assert_eq!(card(&store).column_id, "code_review");
}

#[test]
fn checks_redirect_refuses_writing_stages() {
    let (_dir, mut store) = gate();
    approve(&mut store);
    prepare(&mut store, "implement", AgentStage::Implement, "abc123");

    assert!(store
        .board_stage_checks_failed("implement", "red")
        .unwrap_err()
        .contains("code review"));
}
