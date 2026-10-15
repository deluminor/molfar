use std::path::PathBuf;

use rusqlite::Connection;

use super::artifacts::{self, ArtifactWrite};
use super::types::{CardCreate, CardPatch, StageRunCreate, StageRunPatch, CONFLICT};
use super::{cards, claim, runs, schema, settings};

fn conn() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
    schema::ensure_tables(&conn).unwrap();
    conn
}

fn temp_base() -> PathBuf {
    std::env::temp_dir().join(format!("molfar-task-board-{}", uuid::Uuid::new_v4()))
}

fn card_input(id: &str) -> CardCreate {
    CardCreate {
        id: id.into(),
        project_cwd: "/code/app".into(),
        title: "Add board".into(),
        description: "Build the board".into(),
        acceptance_criteria: String::new(),
        base_ref: Some("main".into()),
    }
}

fn queue(conn: &mut Connection, id: &str, now: i64) {
    let card = cards::get(conn, id).unwrap().unwrap();
    let patch = CardPatch {
        column_id: Some("grill".into()),
        run_state: Some("queued".into()),
        ..CardPatch::default()
    };
    cards::update(conn, id, card.updated_at, &patch, now).unwrap();
}

fn run_input(id: &str, card: &str) -> StageRunCreate {
    StageRunCreate {
        id: id.into(),
        card_id: card.into(),
        stage: "grill".into(),
        harness: "claude".into(),
        model: "claude:opus".into(),
        settings_json: "{}".into(),
        runtime_mode: "auto".into(),
        template_version: 1,
    }
}

#[test]
fn ensure_tables_is_idempotent() {
    let conn = conn();
    schema::ensure_tables(&conn).unwrap();
}

#[test]
fn create_assigns_global_numbers_and_backlog_positions() {
    let mut conn = conn();
    let first = cards::create(&mut conn, &card_input("a"), 10).unwrap();
    let second = cards::create(&mut conn, &card_input("b"), 11).unwrap();

    assert_eq!((first.number, second.number), (1, 2));
    assert_eq!(first.column_id, "backlog");
    assert!(second.position > first.position);
}

#[test]
fn create_rejects_option_like_base_refs_and_blank_titles() {
    let mut conn = conn();
    let mut input = card_input("a");
    input.base_ref = Some("--upload-pack=x".into());
    assert!(cards::create(&mut conn, &input, 1).is_err());

    let mut blank = card_input("b");
    blank.title = "  ".into();
    assert!(cards::create(&mut conn, &blank, 1).is_err());
}

#[test]
fn update_is_compare_and_swap() {
    let mut conn = conn();
    let card = cards::create(&mut conn, &card_input("a"), 10).unwrap();
    let patch = CardPatch {
        title: Some("Renamed".into()),
        ..CardPatch::default()
    };

    let updated = cards::update(&mut conn, "a", card.updated_at, &patch, 10).unwrap();
    let stale = cards::update(&mut conn, "a", card.updated_at, &patch, 12);

    assert_eq!(updated.title, "Renamed");
    assert!(updated.updated_at > card.updated_at);
    assert_eq!(stale.unwrap_err(), CONFLICT);
}

#[test]
fn update_clears_nullable_fields_only_on_explicit_null() {
    let mut conn = conn();
    let card = cards::create(&mut conn, &card_input("a"), 1).unwrap();
    let keep: CardPatch = serde_json::from_str(r#"{"title":"New"}"#).unwrap();
    let kept = cards::update(&mut conn, "a", card.updated_at, &keep, 2).unwrap();
    let clear: CardPatch = serde_json::from_str(r#"{"baseRef":null}"#).unwrap();
    let cleared = cards::update(&mut conn, "a", kept.updated_at, &clear, 3).unwrap();

    assert_eq!(kept.base_ref.as_deref(), Some("main"));
    assert_eq!(cleared.base_ref, None);
}

#[test]
fn claim_respects_limit_and_fifo() {
    let mut conn = conn();
    for id in ["a", "b", "c"] {
        cards::create(&mut conn, &card_input(id), 1).unwrap();
    }
    queue(&mut conn, "b", 5);
    queue(&mut conn, "a", 6);
    queue(&mut conn, "c", 7);

    let first = claim::claim_next(&mut conn, 2, 10).unwrap().unwrap();
    let second = claim::claim_next(&mut conn, 2, 11).unwrap().unwrap();
    let third = claim::claim_next(&mut conn, 2, 12).unwrap();

    assert_eq!((first.id.as_str(), second.id.as_str()), ("b", "a"));
    assert_eq!(first.run_state, "running");
    assert_eq!(first.queued_at, None);
    assert!(third.is_none());
}

#[test]
fn stage_runs_count_attempts_and_freeze_after_settling() {
    let mut conn = conn();
    cards::create(&mut conn, &card_input("a"), 1).unwrap();
    let first = runs::create(&mut conn, &run_input("r1", "a"), 2).unwrap();
    let settle = StageRunPatch {
        status: Some("failed".into()),
        error: Some("boom".into()),
        ..StageRunPatch::default()
    };
    let settled = runs::update(&conn, "r1", &settle, 3).unwrap();
    let second = runs::create(&mut conn, &run_input("r2", "a"), 4).unwrap();

    assert_eq!((first.attempt, second.attempt), (1, 2));
    assert_eq!(settled.completed_at, Some(3));
    assert!(runs::update(&conn, "r1", &settle, 5).is_err());
    assert_eq!(runs::list_running(&conn).unwrap().len(), 1);
}

#[test]
fn artifacts_version_and_round_trip() {
    let mut conn = conn();
    let base = temp_base();
    cards::create(&mut conn, &card_input("a"), 1).unwrap();
    let write = |body: &'static str| ArtifactWrite {
        card_id: "a",
        kind: "spec",
        source: "stage",
        stage_run_id: None,
        body,
    };

    let first = artifacts::write(&mut conn, &base, &write("one"), 2).unwrap();
    let second = artifacts::write(&mut conn, &base, &write("two"), 3).unwrap();

    assert_eq!((first.version, second.version), (1, 2));
    assert_eq!(
        artifacts::read(&conn, &base, "a", "spec", 1).unwrap(),
        "one"
    );
    assert_eq!(
        artifacts::read(&conn, &base, "a", "spec", 2).unwrap(),
        "two"
    );
    assert_eq!(artifacts::list(&conn, "a").unwrap().len(), 2);
    artifacts::remove_card_dir(&base, "a").unwrap();
}

#[test]
fn artifacts_reject_unknown_kinds_and_traversal() {
    let mut conn = conn();
    let base = temp_base();
    cards::create(&mut conn, &card_input("a"), 1).unwrap();
    let bad_kind = ArtifactWrite {
        card_id: "a",
        kind: "../secrets",
        source: "stage",
        stage_run_id: None,
        body: "x",
    };
    let bad_card = ArtifactWrite {
        card_id: "../a",
        kind: "spec",
        source: "stage",
        stage_run_id: None,
        body: "x",
    };

    assert!(artifacts::write(&mut conn, &base, &bad_kind, 2).is_err());
    assert!(artifacts::write(&mut conn, &base, &bad_card, 2).is_err());
    assert!(artifacts::read(&conn, &base, "a", "spec", 1).is_err());
}

#[test]
fn delete_requires_archive_and_cascades() {
    let mut conn = conn();
    let base = temp_base();
    let card = cards::create(&mut conn, &card_input("a"), 1).unwrap();
    let artifact = ArtifactWrite {
        card_id: "a",
        kind: "task",
        source: "user",
        stage_run_id: None,
        body: "task",
    };
    artifacts::write(&mut conn, &base, &artifact, 2).unwrap();
    runs::create(&mut conn, &run_input("r1", "a"), 2).unwrap();

    assert!(cards::delete_archived(&conn, "a").is_err());
    let archive = CardPatch {
        archived: Some(true),
        ..CardPatch::default()
    };
    cards::update(&mut conn, "a", card.updated_at, &archive, 3).unwrap();
    cards::delete_archived(&conn, "a").unwrap();
    artifacts::remove_card_dir(&base, "a").unwrap();

    assert!(artifacts::list(&conn, "a").unwrap().is_empty());
    assert!(runs::list(&conn, "a").unwrap().is_empty());
    assert!(!base.join("a").exists());
}

#[test]
fn settings_default_and_validate() {
    let conn = conn();
    let defaults = settings::get(&conn).unwrap();
    assert_eq!(
        (defaults.max_concurrent_stages, defaults.stall_minutes),
        (3, 45)
    );

    let mut invalid = defaults.clone();
    invalid.max_concurrent_stages = 0;
    assert!(settings::set(&conn, &invalid).is_err());

    let mut saved = defaults;
    saved.stall_minutes = 30;
    settings::set(&conn, &saved).unwrap();
    assert_eq!(settings::get(&conn).unwrap().stall_minutes, 30);
}
