use super::fixtures::conversation;
use super::*;
use molfar_core::follow_up::{Message, State};

#[test]
fn token_batches_coalesce_but_final_stop_flush_preserves_all_pending_rows() {
    let (store, id, mut transcript) = conversation();
    let now = Instant::now();
    let mut pending = PendingSave::new(true, now);
    for text in ["One ", "two ", "three"] {
        pending.changed(transcript.append(text));
    }
    assert!(!pending.due(false, now + Duration::from_millis(200)));
    assert!(!pending.due(false, now + Duration::from_millis(600)));
    assert!(pending.due(true, now + Duration::from_millis(200)));
    assert!(pending.due(false, now + SHARED_SAVE_INTERVAL));
    assert!(
        locked(&store).unwrap().load(id).unwrap().rows[1]
            .text
            .is_empty()
    );
    let stopped = transcript.begin("error");
    transcript.append("Stopped");
    pending.changed(stopped);
    pending
        .flush(&store, id, &transcript, &Default::default(), now)
        .unwrap();
    assert_eq!(
        locked(&store).unwrap().load(id).unwrap().rows,
        transcript.rows
    );
    assert!(!pending.due(true, now));
}

#[test]
fn accepted_queue_message_flushes_prior_tokens_and_its_receipt_atomically() {
    let (store, id, mut transcript) = conversation();
    locked(&store)
        .unwrap()
        .save_follow_ups(
            id,
            &State {
                revision: 1,
                messages: vec![Message {
                    id: "queued".into(),
                    text: "Next".into(),
                    ..Default::default()
                }],
                ..Default::default()
            },
        )
        .unwrap();
    let now = Instant::now();
    let mut pending = PendingSave::new(true, now);
    pending.changed(transcript.append("Still streaming"));
    let from = transcript.begin("user");
    transcript.append("Next");
    pending
        .accept(&store, id, from, &transcript, "queued", now)
        .unwrap();
    let store = locked(&store).unwrap();
    assert_eq!(store.load(id).unwrap().rows, transcript.rows);
    assert!(store.follow_ups(id).unwrap().messages.is_empty());
    assert_eq!(
        store
            .setting(&format!("familiar-delivered:{id}:queued"))
            .unwrap(),
        Some("1".into())
    );
}

#[test]
fn legacy_row_store_keeps_incremental_save_behavior() {
    let now = Instant::now();
    let mut pending = PendingSave::new(false, now);
    pending.changed(0);
    assert!(pending.due(false, now));
}
