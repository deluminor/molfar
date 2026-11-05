use super::*;
use crate::transcript::Row;
use std::path::Path;

#[test]
fn companion_blocks_keep_native_chunks_and_stable_ids() {
    let mut store = Store::open(Path::new(":memory:")).unwrap();
    let session = store.create("codex", "/fixture").unwrap();
    let rows = vec![
        Row {
            role: "user".into(),
            text: "Hello".into(),
            first: true,
            sent_at: Some(12),
        },
        Row {
            role: "assistant".into(),
            text: "First".into(),
            first: true,
            sent_at: None,
        },
        Row {
            role: "assistant".into(),
            text: " second".into(),
            first: false,
            sent_at: None,
        },
    ];
    store.write_rows(session.id, 0, &rows).unwrap();
    let blocks = store.conversation_blocks(session.id).unwrap();
    assert_eq!(blocks.len(), 2);
    assert_eq!(blocks[0]["sentAt"], 12);
    assert_eq!(blocks[1]["text"], "First second");
    assert_eq!(
        blocks,
        store
            .conversation_blocks_with_rows(session.id, &rows)
            .unwrap()
    );
}

#[test]
fn companion_live_history_preserves_shared_metadata_without_writing() {
    let store = Store::open_desktop(Path::new(":memory:")).unwrap();
    let session = store.create("codex", "/fixture").unwrap();
    let source = vec![
        json!({"id":"prompt","role":"user","text":"Hello","attachments":[{"name":"a.png","kind":"image","mimeType":"image/png","path":"/private/a.png"}]}),
        json!({"id":"card","role":"assistant","text":"","familiarCard":{"type":"session","sessionId":"saved-child","title":"Delegated"}}),
        json!({"id":"error","role":"system","text":"Failed","notice":"error"}),
        json!({"id":"reply","role":"assistant","text":"First"}),
    ];
    store.shared_store_blocks(session.id, &source).unwrap();
    let mut transcript = store.load(session.id).unwrap();
    transcript.rows.last_mut().unwrap().text.push_str(" second");
    let blocks = store
        .conversation_blocks_with_rows(session.id, &transcript.rows)
        .unwrap();
    assert_eq!(blocks[0], source[0]);
    assert_eq!(blocks[1], source[1]);
    assert_eq!(blocks[2], source[2]);
    assert_eq!(blocks[3]["id"], "reply");
    assert_eq!(blocks[3]["text"], "First second");
    assert_eq!(store.conversation_blocks(session.id).unwrap(), source);
}
