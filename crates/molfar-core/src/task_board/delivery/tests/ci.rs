use super::{
    super::{
        record,
        service::{
            ci::{check, CiProgress},
            finish, publish,
        },
        types::{DeliveryMethod, DeliveryStep},
    },
    fake::{Board, Fake, URL},
};
use crate::task_board::stage::{
    contracts::{constants::REVIEW, types::ParsedArtifact},
    lifecycle::artifacts,
};
use rusqlite::Connection;

const RED: &str = r#"{"statusCheckRollup":[{"__typename":"CheckRun","name":"check","status":"COMPLETED","conclusion":"FAILURE","detailsUrl":"https://github.com/acme/app/actions/runs/1/job/42"}]}"#;
const GREEN: &str = r#"{"statusCheckRollup":[{"__typename":"CheckRun","name":"check","status":"COMPLETED","conclusion":"SUCCESS"}]}"#;
const PENDING: &str =
    r#"{"statusCheckRollup":[{"__typename":"CheckRun","name":"check","status":"QUEUED"}]}"#;

fn open(board: &Board, port: &Fake, method: DeliveryMethod) {
    board.start();
    let published = publish(&board.store, port, "card", method, DeliveryStep::Open).unwrap();
    board
        .store
        .lock()
        .unwrap()
        .board_await_ci("card", &published.delivery)
        .unwrap();
}

fn look(board: &Board, port: &Fake, rollup: &str) -> CiProgress {
    *port.rollup.borrow_mut() = rollup.into();
    check(&board.store, port, &board.card()).unwrap()
}

fn sql(board: &Board, statement: &str) {
    let store = board.store.lock().unwrap();
    Connection::open(store.database_path())
        .unwrap()
        .execute_batch(statement)
        .unwrap();
}

#[test]
fn merge_waits_for_green_ci_before_merging_and_reaching_done() {
    let board = Board::at("final_review", "idle");
    let port = Fake::default();

    open(&board, &port, DeliveryMethod::Merge);
    assert_eq!(port.count("merge"), 0);
    assert_eq!(board.card().run_state, "ci");
    assert!(matches!(look(&board, &port, PENDING), CiProgress::Waiting));

    let CiProgress::Passed(card) = look(&board, &port, GREEN) else {
        panic!("expected green CI");
    };
    assert_eq!(card.run_state, "running");
    let published = publish(
        &board.store,
        &port,
        "card",
        DeliveryMethod::Merge,
        DeliveryStep::Complete,
    )
    .unwrap();
    finish(&board.store, &port, published, None).unwrap();

    assert_eq!(port.count("merge"), 1);
    assert_eq!(board.card().column_id, "done");
}

#[test]
fn red_ci_reworks_with_the_failed_log_and_a_clean_review_redelivers() {
    let board = Board::at("final_review", "idle");
    let port = Fake::default();
    open(&board, &port, DeliveryMethod::Pr);

    let CiProgress::Reworked(card) = look(&board, &port, RED) else {
        panic!("expected rework");
    };
    assert_eq!(
        (card.column_id.as_str(), card.run_state.as_str()),
        ("rework", "queued")
    );
    assert_eq!(card.rework_cycle, 1);
    let store = board.store.lock().unwrap();
    let brief = store
        .board_latest_artifact("card", "rework_brief")
        .unwrap()
        .unwrap();
    assert!(brief.contains(URL) && brief.contains("job 42 failed: assertion"));
    assert_eq!(
        record::parse(card.delivery_json.as_deref())
            .unwrap()
            .pr_url
            .as_deref(),
        Some(URL)
    );
    drop(store);

    sql(
        &board,
        "UPDATE task_board_cards SET column_id='final_review',run_state='idle' WHERE id='card'",
    );
    let store = board.store.lock().unwrap();
    assert!(store.board_redeliveries().unwrap().is_empty());
    let base = std::path::Path::new(&board.worktree)
        .parent()
        .unwrap()
        .join("task-board");
    let conn = Connection::open(store.database_path()).unwrap();
    let review = ParsedArtifact {
        kind: REVIEW.into(),
        body: "Verdict: APPROVE".into(),
    };
    artifacts::publish(&conn, &base, "card", &review, "stage", None, 20).unwrap();

    let due = store.board_redeliveries().unwrap();
    assert_eq!(due.len(), 1);
    assert_eq!((due[0].0.as_str(), due[0].2), ("card", DeliveryMethod::Pr));
}

#[test]
fn red_ci_past_the_checks_budget_stops_for_the_user() {
    let board = Board::at("final_review", "idle");
    let port = Fake::default();
    open(&board, &port, DeliveryMethod::Pr);
    let base = std::path::Path::new(&board.worktree)
        .parent()
        .unwrap()
        .join("task-board");
    {
        let store = board.store.lock().unwrap();
        let conn = Connection::open(store.database_path()).unwrap();
        for _ in 0..2 {
            let brief = ParsedArtifact {
                kind: "rework_brief".into(),
                body: "## CI failed".into(),
            };
            artifacts::publish(&conn, &base, "card", &brief, "checks", None, 5).unwrap();
        }
    }

    let CiProgress::Stopped(card) = look(&board, &port, RED) else {
        panic!("expected a stop");
    };
    assert_eq!(
        (card.column_id.as_str(), card.run_state.as_str()),
        ("final_review", "failed")
    );
    assert!(card.last_error.unwrap().contains(URL));
}
