use super::{
    super::{
        record,
        service::{self, finish, publish},
        types::{DeliveryMethod, DeliveryStep, ExistingPullRequest},
    },
    fake::{Board, Fake, URL},
};
use crate::task_board::stage::checkout::policy::DIRTY_CHECKOUT;

fn deliver(board: &Board, port: &Fake, method: DeliveryMethod) -> Result<(), String> {
    board.start();
    match publish(&board.store, port, "card", method, DeliveryStep::Complete) {
        Ok(published) => finish(&board.store, port, published, None).map(|_| ()),
        Err(error) => {
            service::fail(&board.store, "card", &error)?;
            Err(error)
        }
    }
}

#[test]
fn pull_request_delivery_reaches_done_with_record_artifact_and_cleanup() {
    let board = Board::at("final_review", "idle");
    let port = Fake::default();

    deliver(&board, &port, DeliveryMethod::Pr).unwrap();

    let card = board.card();
    assert_eq!(
        (card.column_id.as_str(), card.run_state.as_str()),
        ("done", "idle")
    );
    assert_eq!(card.worktree_path, None);
    assert_eq!(card.last_error, None);
    let saved = record::parse(card.delivery_json.as_deref()).unwrap();
    assert_eq!(
        (saved.method, saved.pr_url.as_deref(), saved.merged),
        (DeliveryMethod::Pr, Some(URL), false)
    );
    assert!(saved.delivered_at > 0);
    assert_eq!(
        *port.calls.borrow(),
        [
            "retained",
            "snapshot",
            "github",
            "push",
            "create",
            "remove:clean"
        ]
    );
    let request = port.requests.borrow()[0].clone();
    assert_eq!(request.title, "feat(board): deliver");
    assert_eq!(
        (request.base.as_str(), request.head.as_str()),
        ("main", "molfar/task-card")
    );
    assert!(request.body.ends_with("Task Board card #4."));
    let artifact = board
        .store
        .lock()
        .unwrap()
        .board_latest_artifact("card", "delivery")
        .unwrap()
        .unwrap();
    assert!(artifact.contains("\"prUrl\": \"https://github.com/acme/app/pull/7\""));
}

#[test]
fn failed_merge_resumes_without_a_second_pull_request_and_merges_once() {
    let board = Board::at("final_review", "idle");
    let port = Fake::default();
    port.fail("merge");

    let error = deliver(&board, &port, DeliveryMethod::Merge).unwrap_err();

    let card = board.card();
    assert_eq!(
        (card.column_id.as_str(), card.run_state.as_str()),
        ("final_review", "failed")
    );
    assert_eq!(card.last_error.as_deref(), Some(error.as_str()));
    assert_eq!(
        record::parse(card.delivery_json.as_deref())
            .unwrap()
            .pr_url
            .as_deref(),
        Some(URL)
    );
    port.heal("merge");
    port.fail("remove:clean");
    deliver(&board, &port, DeliveryMethod::Merge).unwrap();

    let card = board.card();
    assert_eq!(card.column_id, "done");
    assert!(record::parse(card.delivery_json.as_deref()).unwrap().merged);
    assert!(card
        .last_error
        .unwrap()
        .starts_with("Delivered, but the worktree could not be removed"));
    assert_eq!(card.worktree_path.as_deref(), Some(board.worktree.as_str()));
    assert_eq!(
        (
            port.count("create"),
            port.count("merge"),
            port.count("push")
        ),
        (1, 2, 2)
    );
}

#[test]
fn saved_merge_short_circuits_and_external_merge_counts_as_merged() {
    let board = Board::at("final_review", "idle");
    let port = Fake::default();
    port.fail("merge");
    *port.existing.borrow_mut() = Some(ExistingPullRequest {
        url: URL.into(),
        merged: true,
    });

    deliver(&board, &port, DeliveryMethod::Merge).unwrap();

    assert!(
        record::parse(board.card().delivery_json.as_deref())
            .unwrap()
            .merged
    );
    assert_eq!(port.count("merge"), 1);
}

#[test]
fn existing_pull_request_is_adopted_when_create_fails() {
    let board = Board::at("final_review", "idle");
    let port = Fake::default();
    port.fail("create");
    *port.existing.borrow_mut() = Some(ExistingPullRequest {
        url: URL.into(),
        merged: false,
    });

    deliver(&board, &port, DeliveryMethod::Pr).unwrap();

    assert_eq!(
        record::parse(board.card().delivery_json.as_deref())
            .unwrap()
            .pr_url
            .as_deref(),
        Some(URL)
    );
    let other = Board::at("final_review", "idle");
    let missing = Fake::default();
    missing.fail("create");
    assert_eq!(
        deliver(&other, &missing, DeliveryMethod::Pr).unwrap_err(),
        "create failed"
    );
}

#[test]
fn keep_skips_github_and_github_outage_offers_keep_only() {
    let board = Board::at("final_review", "idle");
    let port = Fake::default();
    deliver(&board, &port, DeliveryMethod::Keep).unwrap();
    assert_eq!(
        *port.calls.borrow(),
        ["retained", "snapshot", "remove:clean"]
    );
    assert_eq!(
        record::parse(board.card().delivery_json.as_deref())
            .unwrap()
            .method,
        DeliveryMethod::Keep
    );

    let offline = Board::at("final_review", "failed");
    let port = Fake::default();
    port.fail("github");
    let error = deliver(&offline, &port, DeliveryMethod::Pr).unwrap_err();
    assert!(error.starts_with("Only Keep branch is available: GitHub is not reachable"));
    assert_eq!(offline.card().run_state, "failed");
}

#[test]
fn dirty_or_missing_worktree_fails_after_the_lock() {
    let board = Board::at("final_review", "idle");
    let port = Fake::default();
    *port.dirty.borrow_mut() = true;
    assert_eq!(
        deliver(&board, &port, DeliveryMethod::Keep).unwrap_err(),
        DIRTY_CHECKOUT
    );
    assert_eq!(board.card().last_error.as_deref(), Some(DIRTY_CHECKOUT));

    std::fs::remove_dir(&board.worktree).unwrap();
    let error = deliver(&board, &Fake::default(), DeliveryMethod::Keep).unwrap_err();
    assert!(error.contains("missing"));
    assert_eq!(board.card().run_state, "failed");
}

#[test]
fn completed_record_with_removed_worktree_finishes_without_cleanup() {
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
    std::fs::remove_dir(&board.worktree).unwrap();
    service::fail(&board.store, "card", "crashed before Done").unwrap();
    drop(published);

    deliver(&board, &port, DeliveryMethod::Keep).unwrap();

    let card = board.card();
    assert_eq!(
        (card.column_id.as_str(), card.worktree_path),
        ("done", None)
    );
    assert_eq!(port.count("remove:clean"), 0);
    let error = {
        let other = Board::at("final_review", "idle");
        std::fs::remove_dir(&other.worktree).unwrap();
        deliver(&other, &Fake::default(), DeliveryMethod::Pr).unwrap_err()
    };
    assert!(error.contains("missing"));
}

#[test]
fn concurrent_start_and_stale_progress_are_refused() {
    let board = Board::at("final_review", "idle");
    let revision = board.card().updated_at;
    board.start();
    let mut store = board.store.lock().unwrap();

    assert!(store
        .board_deliver_start("card", revision)
        .unwrap_err()
        .starts_with("conflict:"));
    let running = store.board_card("card").unwrap().updated_at;
    assert!(store.board_deliver_start("card", running).is_err());
    assert!(store.board_reject("card", running).is_err());
    assert_eq!(store.board_stuck_deliveries().unwrap(), ["card"]);
    store.board_fail_delivery("card", "interrupted").unwrap();
    let saved = record::parse(Some(r#"{"method":"keep","deliveredAt":0}"#)).unwrap();
    assert!(store
        .board_save_delivery("card", &saved)
        .unwrap_err()
        .starts_with("conflict:"));
    assert!(store.board_stuck_deliveries().unwrap().is_empty());
}
