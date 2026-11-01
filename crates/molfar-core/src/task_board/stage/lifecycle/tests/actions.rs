use super::fixtures::fixture;
use crate::{
    provider::Kind,
    store::Store,
    task_board::stage::{
        agent::AgentStage,
        choice::{self, overrides::StageModelOverride},
        lifecycle::types::StageAction,
    },
};
use rusqlite::Connection;

fn place(directory: &tempfile::TempDir, column: &str, state: &str, overrides: &str) {
    Connection::open(directory.path().join("molfar.db"))
        .unwrap()
        .execute(
            "UPDATE task_board_cards SET column_id=?1,run_state=?2,overrides_json=?3,last_error='old' WHERE id='card'",
            [column, state, overrides],
        )
        .unwrap();
}

fn card(store: &Store) -> crate::task_board::types::Card {
    store
        .board_snapshot(None, false, Some("card"))
        .unwrap()
        .cards
        .remove(0)
}

fn model(id: &str) -> StageModelOverride {
    StageModelOverride {
        model: Some(id.into()),
        ..Default::default()
    }
}

#[test]
fn retry_override_sticks_and_the_next_selection_uses_it() {
    let (directory, mut store) = fixture();
    place(
        &directory,
        "grill",
        "failed",
        r#"{"grill":{"effort":"low"},"implement":{"harness":"claude"},"junk":1}"#,
    );
    let revision = card(&store).updated_at;

    store
        .board_stage_action(
            "card",
            revision,
            StageAction::Retry(Some(model("codex:gpt-5"))),
        )
        .unwrap();
    let retried = card(&store);
    let selected = choice::select(
        AgentStage::Grill,
        None,
        &retried.overrides_json,
        Kind::Codex,
    )
    .unwrap();

    assert_eq!(
        (retried.column_id.as_str(), retried.run_state.as_str()),
        ("grill", "queued")
    );
    assert_eq!(retried.last_error, None);
    assert_eq!(selected.input["model"], "codex:gpt-5");
    assert_eq!(selected.input["effort"], "low");
    assert!(retried
        .overrides_json
        .contains(r#""implement":{"harness":"claude"}"#));
}

#[test]
fn refused_retry_writes_no_override() {
    let (directory, mut store) = fixture();
    place(&directory, "backlog", "idle", "{}");
    let before = card(&store);

    let error = store
        .board_stage_action(
            "card",
            before.updated_at,
            StageAction::Retry(Some(model("codex:x"))),
        )
        .unwrap_err();

    assert!(error.starts_with("Cannot retry"), "{error}");
    assert_eq!(card(&store).overrides_json, "{}");
}

#[test]
fn back_from_failed_matches_the_back_target() {
    for (column, target) in [
        ("grill", "backlog"),
        ("implement", "plan_approval"),
        ("code_review", "final_review"),
        ("rework", "final_review"),
    ] {
        let (directory, mut store) = fixture();
        place(&directory, column, "failed", "{}");
        let revision = card(&store).updated_at;

        store
            .board_stage_action("card", revision, StageAction::Back)
            .unwrap();
        let moved = card(&store);

        assert_eq!(
            (moved.column_id.as_str(), moved.run_state.as_str()),
            (target, "idle"),
            "{column}"
        );
        assert_eq!(moved.last_error, None);
    }
}

#[test]
fn later_stage_retry_and_cancel_wait_for_their_runner() {
    let (directory, mut store) = fixture();
    place(&directory, "implement", "failed", "{}");
    let revision = card(&store).updated_at;

    let error = store
        .board_stage_action("card", revision, StageAction::Retry(None))
        .unwrap_err();

    assert_eq!(
        error,
        "This action is not available for the current Board state."
    );
    assert_eq!(card(&store).run_state, "failed");
}

#[test]
fn stale_revision_refuses_every_decision_without_side_effects() {
    let (directory, mut store) = fixture();
    place(&directory, "grill", "failed", "{}");
    let before = card(&store);

    for action in [
        StageAction::Start,
        StageAction::Retry(Some(model("codex:x"))),
        StageAction::Cancel,
        StageAction::Back,
    ] {
        let error = store
            .board_stage_action("card", before.updated_at - 1, action)
            .unwrap_err();
        assert!(error.starts_with("conflict:"), "{error}");
    }

    assert_eq!(card(&store), before);
}

#[test]
fn override_merge_rejects_invalid_or_oversized_input() {
    let invalid = StageModelOverride {
        harness: Some("unknown".into()),
        ..Default::default()
    };
    assert!(choice::overrides::merge_retry_override("{}", AgentStage::Grill, &invalid).is_err());

    let huge = model(&"m".repeat(21_000));
    assert!(choice::overrides::merge_retry_override("{}", AgentStage::Grill, &huge).is_err());
}
