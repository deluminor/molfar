use crate::{
    consumption::{summary::Reporting, TokenCounts, UsageRecord},
    store::Store,
};
use chrono::Utc;
use rusqlite::params;
use std::path::Path;

fn record(key: &str, at: u64, output: u64) -> UsageRecord {
    UsageRecord {
        source_key: key.into(),
        provider: "codex".into(),
        model_id: Some("gpt-6.1-sol".into()),
        model_name: None,
        started_at_ms: Some(at),
        reported_at_ms: Some(at),
        tier: None,
        tokens: Some(TokenCounts {
            output,
            ..Default::default()
        }),
    }
}

fn add_run(store: &Store, id: &str, stage: &str, session: &str, start: i64, end: i64) {
    store
        .conn
        .execute(
            "INSERT INTO task_board_stage_runs(id,card_id,stage,attempt,session_id,harness,model,
             settings_json,runtime_mode,template_version,dispatch,status,started_at,completed_at)
             VALUES(?1,'card',?2,1,?3,'codex','gpt-6.1-sol','{}','auto',1,'settled','succeeded',?4,?5)",
            params![id, stage, session, start, end],
        )
        .unwrap();
}

fn board_fixture() -> (Store, i64, i64, i64) {
    let store = Store::open_desktop(Path::new(":memory:")).unwrap();
    crate::task_board::schema::ensure_tables(&store.conn).unwrap();
    store
        .conn
        .execute(
            "INSERT INTO task_board_cards(id,number,project_cwd,title,description,column_id,
             position,created_at,updated_at) VALUES('card',15,'/project','Usage','','final_review',1,1,1)",
            [],
        )
        .unwrap();
    let build = store.create("codex", "/project").unwrap().id;
    let review = store.create("codex", "/project").unwrap().id;
    let other = store.create("codex", "/elsewhere").unwrap().id;
    let build_key = store.persisted_session_id(build).unwrap();
    let review_key = store.persisted_session_id(review).unwrap();
    add_run(&store, "grill", "grill", &build_key, 100, 200);
    add_run(&store, "implement", "implement", &build_key, 300, 400);
    add_run(&store, "review", "code_review", &review_key, 500, 600);
    store.save_consumption(build, &record("g", 150, 1)).unwrap();
    store
        .save_consumption(build, &record("i", 350, 10))
        .unwrap();
    store
        .save_consumption(review, &record("r", 550, 100))
        .unwrap();
    store
        .save_consumption(other, &record("o", 700, 1_000))
        .unwrap();

    (store, build, review, other)
}

#[test]
fn card_usage_counts_the_shared_build_session_once() {
    let (store, ..) = board_fixture();

    let usage = store.card_consumption("card", 1_000).unwrap();

    assert_eq!(usage.total.tokens.output, 111);
    let per_run: Vec<_> = usage
        .runs
        .iter()
        .map(|run| run.summary.tokens.output)
        .collect();
    assert_eq!(per_run, vec![1, 10, 100]);
    assert_eq!(usage.other.reporting(), Reporting::Empty);
}

#[test]
fn project_scope_filters_sessions_cards_and_days() {
    let (store, build, review, other) = board_fixture();

    let project = store.project_consumption(Some("/project/"), &Utc).unwrap();
    let everything = store.project_consumption(None, &Utc).unwrap();

    let ids: Vec<_> = project.sessions.iter().map(|row| row.session).collect();
    assert_eq!(ids, vec![review, build]);
    assert_eq!(project.total.tokens.output, 111);
    assert_eq!(project.cards.len(), 1);
    assert_eq!(project.cards[0].number, 15);
    assert_eq!(project.cards[0].summary.tokens.output, 111);
    assert_eq!(project.days.len(), 1);
    assert!(project.issues.is_empty());
    assert_eq!(everything.sessions[0].session, other);
    assert_eq!(everything.total.tokens.output, 1_111);
}

#[test]
fn stores_without_usage_or_board_read_as_empty() {
    let store = Store::open(Path::new(":memory:")).unwrap();

    let usage = store.project_consumption(None, &Utc).unwrap();

    assert_eq!(usage.total.reporting(), Reporting::Empty);
    assert!(usage.cards.is_empty());
}
