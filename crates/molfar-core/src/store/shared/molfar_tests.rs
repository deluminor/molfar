use super::*;

#[test]
fn fresh_molfar_schema_can_retain_task_card_associations() {
    let store = Store::open_desktop(Path::new(":memory:")).unwrap();
    let session = store.create("codex", "/project").unwrap();
    let source = store.persisted_session_id(session.id).unwrap();
    store
        .conn
        .execute(
            "UPDATE sessions SET task_card_id='card-1' WHERE id=?1",
            [&source],
        )
        .unwrap();
    store.title(session.id, "Renamed").unwrap();
    let card: String = store
        .conn
        .query_row(
            "SELECT task_card_id FROM sessions WHERE id=?1",
            [&source],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(card, "card-1");
}

#[test]
fn molfar_associations_and_rich_blocks_survive_edit_append_and_reopen() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("molfar.db");
    let mut store = Store::open_desktop(&path).unwrap();
    store
        .conn
        .execute_batch("ALTER TABLE sessions ADD COLUMN future_metadata TEXT")
        .unwrap();
    let session = store.create("codex", "/project").unwrap();
    let source = store.persisted_session_id(session.id).unwrap();
    let work_item =
        json!({"provider":"jira","key":"MOL-42","url":"https://jira.example/MOL-42","future":true});
    store.conn.execute(
        "UPDATE sessions SET task_card_id='card-1',automation_id='habit-1',linked_work_item_json=?2,future_metadata='retain' WHERE id=?1",
        params![source, work_item.to_string()],
    ).unwrap();
    let original = vec![
        json!({"id":"prompt-original","role":"user","text":"Read @knowledge/plan", "startedAt":100,
            "attachments":[{"id":"knowledge:v:Projects/Plan.md","kind":"knowledge","vaultId":"v","path":"Projects/Plan.md","revision":"r1"}],
            "turnModel":{"harness":"codex","id":"codex:gpt","name":"GPT"},"future":{"preserve":true}}),
        json!({"id":"plan-original","role":"plan","text":"Saved plan","plan":{"key":"plan-42","status":"ready","originalText":"Saved plan","edited":false},"streaming":false}),
        json!({"id":"reply-original","role":"assistant","text":"Saved reply","artifactCards":[{"id":"artifact-42","kind":"html"}],
            "familiarSessionCompletion":{"sessionCount":2,"future":true}}),
    ];
    store.shared_store_blocks(session.id, &original).unwrap();
    let mut transcript = store.load(session.id).unwrap();
    let from = transcript.rows.len();
    transcript.begin("user");
    transcript.append("Follow up");
    transcript.begin("assistant");
    transcript.append("New answer");
    store
        .write_rows(session.id, from, &transcript.rows[from..])
        .unwrap();
    transcript.append(" edited");
    let last = transcript.rows.len() - 1;
    store
        .write_rows(session.id, last, &transcript.rows[last..])
        .unwrap();
    store.title(session.id, "Updated title").unwrap();
    drop(store);

    let store = Store::open_desktop(&path).unwrap();
    let restored = store
        .sessions()
        .unwrap()
        .into_iter()
        .find(|s| s.id == session.id)
        .unwrap();
    assert_eq!(store.persisted_session_id(restored.id).unwrap(), source);
    let blocks = store.shared_blocks(restored.id).unwrap();
    assert_eq!(&blocks[..original.len()], &original);
    assert_eq!(blocks.last().unwrap()["text"], "New answer edited");
    let metadata: (String,String,String,String) = store.conn.query_row(
        "SELECT task_card_id,automation_id,linked_work_item_json,future_metadata FROM sessions WHERE id=?1",
        [&source], |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?)),
    ).unwrap();
    assert_eq!(metadata.0, "card-1");
    assert_eq!(metadata.1, "habit-1");
    assert_eq!(parse::<Value>(&metadata.2).unwrap(), work_item);
    assert_eq!(metadata.3, "retain");
}

#[test]
fn opening_an_older_molfar_schema_never_adds_card_columns() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("molfar.db");
    let store = Store::open_desktop(&path).unwrap();
    store
        .conn
        .execute_batch("ALTER TABLE sessions DROP COLUMN task_card_id")
        .unwrap();
    drop(store);
    let before = std::fs::read(&path).unwrap();

    let store = Store::open_desktop(&path).unwrap();
    assert!(store.sessions().unwrap().is_empty());
    assert!(!store
        .shared
        .as_ref()
        .unwrap()
        .columns
        .contains("task_card_id"));
    drop(store);
    assert_eq!(std::fs::read(&path).unwrap(), before);
}

#[test]
fn molfar_queue_restart_preserves_order_errors_and_session_ownership() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("molfar.db");
    let store = Store::open_desktop(&path).unwrap();
    let first = store.create("codex", "/project").unwrap().id;
    let second = store.create("codex", "/other").unwrap().id;
    let source = store.persisted_session_id(first).unwrap();
    let queue = json!([
        {"id":"q-1","text":"First","error":"Offline","future":{"keep":true}},
        {"id":"q-2","text":"Second","familiarSessionCompletion":{"sessionCount":2}}
    ]);
    store
        .conn
        .execute(
            "UPDATE sessions SET queued_messages_json=?2,queue_status='active' WHERE id=?1",
            params![source, queue.to_string()],
        )
        .unwrap();
    drop(store);

    let mut store = Store::open_desktop(&path).unwrap();
    store.sessions().unwrap();
    let state = store.follow_ups(first).unwrap();
    assert!(state.paused);
    assert_eq!(
        state
            .messages
            .iter()
            .map(|m| m.id.as_str())
            .collect::<Vec<_>>(),
        vec!["q-1", "q-2"]
    );
    assert_eq!(state.messages[0].error.as_deref(), Some("Offline"));
    assert!(store.follow_ups(second).unwrap().messages.is_empty());
    store.save_follow_ups(first, &state).unwrap();
    let blocks = store.load(first).unwrap();
    let mut transcript = blocks;
    transcript.begin("user");
    transcript.append("First");
    store
        .write_rows_with_message(first, 0, &transcript.rows, Some("q-1"))
        .unwrap();
    let remaining: String = store
        .conn
        .query_row(
            "SELECT queued_messages_json FROM sessions WHERE id=?1",
            [&source],
            |r| r.get(0),
        )
        .unwrap();
    let remaining = parse::<Vec<Value>>(&remaining).unwrap();
    assert_eq!(remaining.len(), 1);
    for (key, value) in queue[1].as_object().unwrap() {
        assert_eq!(&remaining[0][key], value);
    }
    assert!(store.follow_ups(second).unwrap().messages.is_empty());
}
