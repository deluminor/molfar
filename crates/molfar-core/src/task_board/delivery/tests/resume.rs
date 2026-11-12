use super::{
    super::{
        service::{self, finish, publish},
        types::{DeliveryMethod, DeliveryStep},
    },
    fake::{Board, Fake},
};

#[test]
fn crash_after_a_saved_merge_resumes_without_merging_again() {
    let board = Board::at("final_review", "idle");
    let port = Fake::default();
    board.start();
    drop(
        publish(
            &board.store,
            &port,
            "card",
            DeliveryMethod::Merge,
            DeliveryStep::Complete,
        )
        .unwrap(),
    );
    service::fail(&board.store, "card", "crashed before Done").unwrap();

    board.start();
    let published = publish(
        &board.store,
        &port,
        "card",
        DeliveryMethod::Merge,
        DeliveryStep::Complete,
    )
    .unwrap();
    finish(&board.store, &port, published, None).unwrap();

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

#[test]
fn worktree_in_use_still_reaches_done_and_keeps_the_tree() {
    let board = Board::at("final_review", "idle");
    let port = Fake::default();
    board.start();
    let published = publish(
        &board.store,
        &port,
        "card",
        DeliveryMethod::Keep,
        DeliveryStep::Complete,
    )
    .unwrap();

    let finished = finish(
        &board.store,
        &port,
        published,
        Some("Close the terminals using this worktree first."),
    )
    .unwrap();

    assert!(!finished.removed);
    assert_eq!(port.count("remove:clean"), 0);
    let card = board.card();
    assert_eq!(
        (card.column_id.as_str(), card.worktree_path.as_deref()),
        ("done", Some(board.worktree.as_str()))
    );
    assert_eq!(
        card.last_error.as_deref(),
        Some("Delivered, but the worktree could not be removed: Close the terminals using this worktree first.")
    );
}

#[test]
fn missing_base_ref_falls_back_to_the_default_branch() {
    let board = Board::at("final_review", "idle");
    rusqlite::Connection::open(board.store.lock().unwrap().database_path())
        .unwrap()
        .execute(
            "UPDATE task_board_cards SET base_ref=NULL WHERE id='card'",
            [],
        )
        .unwrap();
    let port = Fake::default();
    board.start();

    publish(
        &board.store,
        &port,
        "card",
        DeliveryMethod::Pr,
        DeliveryStep::Complete,
    )
    .unwrap();

    assert_eq!(port.requests.borrow()[0].base, "develop");
}

#[test]
fn native_only_store_has_no_stuck_deliveries() {
    let dir = tempfile::tempdir().unwrap();
    let store = crate::store::Store::open(&dir.path().join("native.db")).unwrap();

    assert!(store.board_stuck_deliveries().unwrap().is_empty());
}
