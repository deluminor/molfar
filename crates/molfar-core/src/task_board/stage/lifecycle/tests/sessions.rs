use super::fixtures::{choice, fixture, prepare};
use crate::task_board::stage::lifecycle::types::{FailureStatus, StageAction};

#[test]
fn grill_lifecycle_named_session_visible_owned_and_cancel_prevents_late_launch() {
    let (_dir, mut store) = fixture();
    let session = prepare(&mut store, "run-one");
    assert_eq!(
        store.persisted_session_id(session).unwrap(),
        "board-run-one"
    );
    let saved = store
        .sessions()
        .unwrap()
        .into_iter()
        .find(|s| s.id == session)
        .unwrap();
    assert_eq!(saved.title, "#1 · Grill · A card");
    assert_eq!(saved.cwd, "/project");
    assert_eq!(
        store.session_task_card(session).unwrap().as_deref(),
        Some("card")
    );
    assert!(store.board_owned_session_ids().unwrap().contains(&session));
    let settings = store.agent_settings(session).unwrap().unwrap();
    assert_eq!(settings.worktree_cwd.as_deref(), Some("/retained/card"));
    assert!(!settings.new_worktree && !settings.operator_enabled && !settings.orchestrator);
    let ctx = store.board_stage_context("run-one").unwrap().unwrap();
    let effect = store
        .board_stage_action("card", ctx.card.updated_at, StageAction::Cancel)
        .unwrap();
    assert_eq!(effect.stop_session_id.as_deref(), Some("board-run-one"));
    assert!(!store.board_stage_is_current("run-one").unwrap());
    assert!(store
        .board_reserve_stage_session("run-one", &choice().settings, "Prompt manifest")
        .is_err());
    assert!(
        !store
            .board_fail_stage("run-one", FailureStatus::Failed, "Late provider error")
            .unwrap()
            .changed
    );
}

#[test]
fn grill_lifecycle_prepared_prompt_is_durable_but_not_submission_evidence() {
    let (_dir, mut store) = fixture();
    let session = prepare(&mut store, "run-one");
    assert!(!store.board_record_stage_submitted("run-one").unwrap());
    assert!(store.follow_ups(session).unwrap().draft.is_some());
    let first = store
        .board_reserve_stage_session("run-one", &choice().settings, "Prompt manifest")
        .unwrap();
    assert_eq!(first.session.id, session);
    assert!(store
        .board_reserve_stage_session("run-one", &choice().settings, "Different prompt")
        .is_err());
    let state = store.follow_ups(session).unwrap();
    assert_eq!(state.draft.unwrap().text, "Prompt manifest");
}
