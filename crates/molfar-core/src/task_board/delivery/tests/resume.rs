use super::{
    super::{
        service::{self, finish, publish},
        types::DeliveryMethod,
    },
    fake::{Board, Fake},
};

#[test]
fn crash_after_a_saved_merge_resumes_without_merging_again() {
    let board = Board::at("final_review", "idle");
    let port = Fake::default();
    board.start();
    drop(publish(&board.store, &port, "card", DeliveryMethod::Merge).unwrap());
    service::fail(&board.store, "card", "crashed before Done").unwrap();

    board.start();
    let published = publish(&board.store, &port, "card", DeliveryMethod::Merge).unwrap();
    finish(&board.store, &port, published).unwrap();

    assert_eq!(
        (
            port.count("create"),
            port.count("merge"),
            port.count("push")
        ),
        (1, 1, 2)
    );
    assert_eq!(board.card().column_id, "done");
}

#[test]
fn stage_reconcile_and_claims_leave_a_delivering_card_alone() {
    let board = Board::at("final_review", "idle");
    board.start();
    let mut store = board.store.lock().unwrap();

    let effects = store
        .board_reconcile_orphan_claims(&std::collections::HashSet::new())
        .unwrap();

    assert!(effects.is_empty());
    assert!(store.board_claim_next_stage().unwrap().is_none());
    let card = store.board_card("card").unwrap();
    assert_eq!(
        (card.column_id.as_str(), card.run_state.as_str()),
        ("final_review", "running")
    );
}
