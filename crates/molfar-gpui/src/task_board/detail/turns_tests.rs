use super::turns::fold;
use molfar_core::task_board::{
    constants::{CODE_REVIEW, IMPLEMENT},
    stage::lifecycle::constants::{FAILED, PARTIAL, SUCCEEDED},
    types::StageRun,
};
use std::collections::HashMap;

fn run(id: &str, stage: &str, status: &str, session: Option<&str>) -> StageRun {
    StageRun {
        id: id.into(),
        card_id: "card".into(),
        stage: stage.into(),
        attempt: 1,
        session_id: session.map(str::to_owned),
        harness: "codex".into(),
        model: "codex:gpt-5".into(),
        settings_json: "{}".into(),
        runtime_mode: "auto".into(),
        template_version: 1,
        dispatch: "settled".into(),
        status: status.into(),
        error: None,
        head_before: None,
        porcelain_before: None,
        fingerprint_before: None,
        head_after: None,
        started_at: 1,
        completed_at: Some(2),
    }
}

#[test]
fn partial_turns_in_one_session_fold_into_one_entry_with_their_compactions() {
    let runs = [
        run("a", IMPLEMENT, PARTIAL, Some("s")),
        run("b", IMPLEMENT, PARTIAL, Some("s")),
        run("c", IMPLEMENT, PARTIAL, Some("s")),
        run("d", IMPLEMENT, FAILED, Some("s")),
        run("review", CODE_REVIEW, SUCCEEDED, Some("r")),
    ];
    let compactions = HashMap::from([("b".to_owned(), 1), ("d".to_owned(), 1)]);

    let entries = fold(&runs, &compactions);

    assert_eq!(entries.len(), 2);
    assert_eq!(
        (entries[0].first.id.as_str(), entries[0].last.id.as_str()),
        ("a", "d")
    );
    assert_eq!(
        entries[0].summary().as_deref(),
        Some("4 turns · 2 compactions")
    );
    assert_eq!(entries[1].summary(), None);
}

#[test]
fn another_session_another_stage_or_a_finished_turn_starts_a_new_entry() {
    let runs = [
        run("legacy", IMPLEMENT, PARTIAL, Some("old")),
        run("fresh", IMPLEMENT, PARTIAL, Some("new")),
        run("done", IMPLEMENT, SUCCEEDED, Some("new")),
        run("retry", IMPLEMENT, SUCCEEDED, Some("new")),
        run("orphan", IMPLEMENT, PARTIAL, None),
        run("orphan-next", IMPLEMENT, SUCCEEDED, None),
    ];
    let compactions = HashMap::from([("fresh".to_owned(), 1)]);

    let entries = fold(&runs, &compactions);

    let ids: Vec<_> = entries.iter().map(|entry| entry.last.id.as_str()).collect();
    assert_eq!(ids, ["legacy", "done", "retry", "orphan", "orphan-next"]);
    assert_eq!(
        entries[1].summary().as_deref(),
        Some("2 turns · 1 compaction")
    );
}
