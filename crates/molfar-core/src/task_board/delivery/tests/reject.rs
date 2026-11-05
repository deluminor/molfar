use super::{
    super::service::reject::reject_cleanup,
    fake::{Board, Fake},
};

fn reject(board: &Board, port: &Fake) -> crate::task_board::types::Card {
    let revision = board.card().updated_at;
    let (before, archived) = board
        .store
        .lock()
        .unwrap()
        .board_reject("card", revision)
        .unwrap();
    assert!(archived.archived);
    assert_eq!(archived.worktree_path, None);
    reject_cleanup(&board.store, port, &before, archived)
        .unwrap()
        .card
}

#[test]
fn reject_archives_then_force_removes_worktree_and_unpushed_branch() {
    for column in ["implement", "final_review", "backlog"] {
        let board = Board::at(column, "failed");
        let port = Fake::default();

        let card = reject(&board, &port);

        assert!(card.archived, "{column}");
        assert_eq!(
            (card.column_id.as_str(), card.run_state.as_str()),
            (column, "idle")
        );
        assert_eq!(*port.calls.borrow(), ["remove:force", "branch"]);
        assert_eq!(board.card().last_error, None);
    }
}

#[test]
fn reject_cleanup_failures_keep_the_archive_with_specific_notes() {
    let board = Board::at("final_review", "idle");
    let port = Fake::default();
    port.fail("remove:force");
    let card = reject(&board, &port);
    assert!(card.archived);
    assert_eq!(card.worktree_path.as_deref(), Some(board.worktree.as_str()));
    assert!(card
        .last_error
        .unwrap()
        .starts_with("Archived, but the worktree could not be removed"));
    assert_eq!(port.count("branch"), 0);

    let board = Board::at("final_review", "idle");
    let port = Fake::default();
    port.fail("branch");
    let card = reject(&board, &port);
    assert_eq!(card.worktree_path, None);
    assert!(card
        .last_error
        .unwrap()
        .starts_with("Archived, but the task branch could not be removed"));
}

#[test]
fn done_archive_keeps_the_branch_and_never_forces_removal() {
    let board = Board::at("done", "idle");
    let port = Fake::default();

    let card = reject(&board, &port);

    assert!(card.archived);
    assert_eq!(*port.calls.borrow(), ["remove:clean"]);
}

#[test]
fn running_cards_cannot_be_rejected_and_archived_cards_refuse_delivery() {
    let board = Board::at("implement", "running");
    let revision = board.card().updated_at;
    assert!(board
        .store
        .lock()
        .unwrap()
        .board_reject("card", revision)
        .is_err());

    let board = Board::at("final_review", "idle");
    reject(&board, &Fake::default());
    let revision = board.card().updated_at;
    assert_eq!(
        board
            .store
            .lock()
            .unwrap()
            .board_deliver_start("card", revision)
            .unwrap_err(),
        "The card is archived."
    );
}
