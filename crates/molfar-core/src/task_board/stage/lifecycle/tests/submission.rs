use super::fixtures::{fixture, prepare};
use crate::{task_board::stage::lifecycle::types::StageAction, transcript::Transcript};

#[test]
fn cancelled_board_prompt_is_refused_inside_initial_transcript_write() {
    let (_directory, mut store) = fixture();
    let session = prepare(&mut store, "run-one");
    let message = format!(
        "app-prompt-{}",
        crate::familiar::files::content_hash("run-one")
    );
    store
        .board_validate_prompt_submission(session, Some(&message))
        .unwrap();
    let context = store.board_grill_context("run-one").unwrap().unwrap();
    store
        .board_stage_action("card", context.card.updated_at, StageAction::Cancel)
        .unwrap();
    let before = store.load(session).unwrap().rows;
    let mut transcript = Transcript::default();
    transcript.begin("user");
    transcript.append("Must never submit");
    transcript.begin("assistant");
    assert!(store
        .write_rows_with_message(session, 0, &transcript.rows, Some(&message))
        .is_err());
    assert_eq!(store.load(session).unwrap().rows.len(), before.len());
    assert!(store.app_turn_result(session, "run-one").unwrap().is_none());
    assert!(store.follow_ups(session).unwrap().draft.is_some());
    store
        .board_validate_prompt_submission(session, Some("ordinary-app-request"))
        .unwrap();
}
