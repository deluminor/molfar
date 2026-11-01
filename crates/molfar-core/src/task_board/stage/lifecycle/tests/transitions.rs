use super::fixtures::fixture;
use crate::task_board::stage::lifecycle::types::StageAction;

#[test]
fn grill_lifecycle_start_is_cas_guarded_and_claimed_only_once() {
    let (_directory, mut store) = fixture();
    let queued = store
        .board_stage_action("card", 1, StageAction::Start)
        .unwrap();
    assert_eq!(queued.card.column_id, "grill");
    assert_eq!(queued.card.run_state, "queued");
    assert_eq!(queued.card.grill_round, 1);
    assert!(store
        .board_stage_action("card", 1, StageAction::Start)
        .is_err());
    let claimed = store.board_claim_next_grill().unwrap().unwrap();
    assert_eq!(claimed.id, "card");
    assert_eq!(claimed.run_state, "running");
    assert!(store.board_claim_next_grill().unwrap().is_none());
}
