use super::fixtures::{accept, before, choice, complete, fixture};
use crate::{
    store::Store,
    task_board::stage::lifecycle::types::{FailureStatus, StageAction},
};
use std::sync::{Arc, Barrier};

#[test]
fn concurrent_starts_and_claims_cannot_duplicate_card_ownership() {
    let (_dir, store) = fixture();
    let path = store.database_path().to_path_buf();
    let barrier = Arc::new(Barrier::new(2));
    let workers: Vec<_> = (0..2)
        .map(|_| {
            let mut store = Store::open_desktop(&path).unwrap();
            let barrier = barrier.clone();
            std::thread::spawn(move || {
                barrier.wait();
                store.board_stage_action("card", 1, StageAction::Start)
            })
        })
        .collect();
    let successes = workers
        .into_iter()
        .map(|worker| worker.join().unwrap())
        .filter(Result::is_ok)
        .count();
    assert_eq!(successes, 1);

    let barrier = Arc::new(Barrier::new(2));
    let workers: Vec<_> = (0..2)
        .map(|_| {
            let mut store = Store::open_desktop(&path).unwrap();
            let barrier = barrier.clone();
            std::thread::spawn(move || {
                barrier.wait();
                store.board_claim_next_stage().unwrap()
            })
        })
        .collect();
    let claims = workers
        .into_iter()
        .map(|worker| worker.join().unwrap())
        .filter(Option::is_some)
        .count();
    assert_eq!(claims, 1);
}

#[test]
fn cancelled_completed_run_cannot_settle_or_stop_retry() {
    let (_dir, mut store) = fixture();
    let old_output = complete(&mut store, "run-one");
    let old = store.board_stage_context("run-one").unwrap().unwrap();
    store
        .board_stage_action("card", old.card.updated_at, StageAction::Cancel)
        .unwrap();
    let next = accept(&mut store, "run-two");
    assert_eq!(next.run.attempt, 2);
    assert!(
        !store
            .board_finish_stage("run-one", &old_output)
            .unwrap()
            .changed
    );
    assert!(
        !store
            .board_fail_stage("run-one", FailureStatus::Failed, "Late failure")
            .unwrap()
            .changed
    );
    assert!(store.board_stage_is_current("run-two").unwrap());
    assert!(store.board_stage_artifacts("card").unwrap().is_empty());
    assert!(store
        .board_record_stage_prepared("run-one", &before(), "board-run-one")
        .unwrap()
        .is_none());
}

#[test]
fn concurrent_receipt_settlement_publishes_one_artifact_set() {
    let (_dir, mut store) = fixture();
    let output = complete(&mut store, "run-one");
    let barrier = Arc::new(Barrier::new(2));
    let workers: Vec<_> = (0..2)
        .map(|_| {
            let mut connection = Store::open_desktop(store.database_path()).unwrap();
            let output = output.clone();
            let barrier = barrier.clone();
            std::thread::spawn(move || {
                barrier.wait();
                connection
                    .board_finish_stage("run-one", &output)
                    .unwrap()
                    .changed
            })
        })
        .collect();
    assert_eq!(
        workers
            .into_iter()
            .map(|worker| worker.join().unwrap())
            .filter(|changed| *changed)
            .count(),
        1
    );
    assert_eq!(store.board_stage_artifacts("card").unwrap().len(), 2);
}

#[test]
fn read_only_store_refuses_stage_side_effects_and_keeps_database_bytes() {
    let (dir, mut store) = fixture();
    let ctx = accept(&mut store, "run-one");
    let path = store.database_path().to_path_buf();
    drop(store);
    let bytes = std::fs::read(&path).unwrap();
    let mut read = Store::read_desktop(&path).unwrap();
    assert!(read
        .board_stage_action("card", ctx.card.updated_at, StageAction::Cancel)
        .is_err());
    assert!(read.board_claim_next_stage().is_err());
    assert!(read
        .board_accept_stage("card", ctx.card.updated_at, "run-two", &choice())
        .is_err());
    assert!(read
        .board_fail_stage("run-one", FailureStatus::Failed, "Denied")
        .is_err());
    assert!(read.board_take_stall_notices(u64::MAX).is_err());
    drop(read);
    assert_eq!(bytes, std::fs::read(path).unwrap());
    assert!(!dir.path().join("task-board").exists());
}
