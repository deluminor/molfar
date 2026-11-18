use super::super::owner::gate;
use super::fixtures::*;
use crate::task_board::stage::agent::AgentStage;

const OWNER: &str = "<<<MOLFAR:impl_report>>>Status: complete\n## Summary\nAll code done.\n## Owner verification\n- AC-10: live OpenBot smoke with the owner's account\n## Checks run and results (lint, typecheck, tests)\nnative:check exit 0<<<END:impl_report>>>";

#[test]
fn owner_only_checks_advance_to_code_review_and_stay_listed_for_the_owner() {
    let (_dir, mut store) = gate();
    approve(&mut store);
    assert!(store.board_owner_checks("card").unwrap().is_none());

    finish(
        &mut store,
        "implement",
        AgentStage::Implement,
        "abc123",
        "committed",
        OWNER,
    );

    let card = &store
        .board_snapshot(None, false, Some("card"))
        .unwrap()
        .cards[0];
    assert_eq!(
        (card.column_id.as_str(), card.run_state.as_str()),
        ("code_review", "queued")
    );
    assert!(card.last_error.is_none());
    assert_eq!(
        store.board_owner_checks("card").unwrap(),
        Some((
            1,
            vec!["AC-10: live OpenBot smoke with the owner's account".to_owned()]
        ))
    );
}
