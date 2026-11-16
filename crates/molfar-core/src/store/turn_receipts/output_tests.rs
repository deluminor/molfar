use super::tests::{fixture, root};
use serde_json::json;

#[test]
fn turn_receipt_exact_reader_rejects_duplicate_requests_and_root_ids() {
    let (store, id) = fixture(vec![root("run")]);
    assert!(store.app_turn_result(id, "missing").unwrap().is_none());
    let mut second = root("run");
    second["id"] = json!("second");
    let (store, id) = fixture(vec![root("run"), second]);
    assert!(store
        .app_turn_result(id, "run")
        .unwrap_err()
        .contains("more than one"));
    let mut duplicate = root("other");
    duplicate["startedAt"] = json!(200);
    let (store, id) = fixture(vec![root("run"), duplicate]);
    assert!(store
        .app_turn_result(id, "run")
        .unwrap_err()
        .contains("identity is ambiguous"));
    let mut draft = root("run");
    draft["draft"] = json!(true);
    let (store, id) = fixture(vec![draft]);
    assert!(store.app_turn_result(id, "run").unwrap().is_none());
}

#[test]
fn turn_receipt_exact_reader_preserves_large_continuations_and_excludes_other_roles() {
    let text = format!(
        "<<<MOLFAR:spec>>>\n{}\n<<<END:spec>>>",
        "Long output\n".repeat(4000)
    );
    let (mut store, id) = fixture(vec![
        root("run"),
        json!({"id":"first","role":"assistant","text":text}),
        json!({"id":"thought","role":"thinking","text":"Do not include"}),
        json!({"id":"tool","role":"tool","text":"Do not include","tool":{"kind":"read"}}),
        json!({"id":"error","role":"error","text":"Do not include"}),
        json!({"id":"draft","role":"assistant","text":"Do not include","draft":true}),
        json!({"id":"final","role":"assistant","text":"Final bytes  \n"}),
        json!({"id":"next","role":"user","text":"Next turn","startedAt":300}),
        json!({"id":"unrelated","role":"assistant","text":"Do not include"}),
    ]);
    let original = store.shared_blocks(id).unwrap();
    let result = store.app_turn_result(id, "run").unwrap().unwrap();
    assert_eq!(result.text, format!("{text}\nFinal bytes  \n"));
    assert!(result.text.len() > 20_000);
    assert_eq!(store.shared_blocks(id).unwrap(), original);
    let transcript = store.load(id).unwrap();
    store.write_rows(id, 0, &transcript.rows).unwrap();
    assert_eq!(
        store.app_turn_result(id, "run").unwrap().unwrap().text,
        result.text
    );
}

#[test]
fn turn_receipt_exact_reader_uses_whole_indexed_history_beyond_ten_turns() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("molfar.db");
    let store = crate::store::Store::open_desktop(&path).unwrap();
    let id = store.create("codex", "/project").unwrap().id;
    let original = store.persisted_session_id(id).unwrap();
    let source = include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../src-tauri/src/familiar_transcript.rs"
    ));
    let schema = source
        .split("CREATE TABLE IF NOT EXISTS familiar_transcripts (")
        .nth(1)
        .unwrap()
        .split("\",")
        .next()
        .unwrap();
    store
        .conn
        .execute_batch(&format!(
            "CREATE TABLE IF NOT EXISTS familiar_transcripts ({schema}"
        ))
        .unwrap();
    store
        .conn
        .execute("INSERT INTO familiar_transcripts VALUES(?1)", [&original])
        .unwrap();
    let mut blocks = vec![
        root("early"),
        json!({"id":"early-answer","role":"assistant","text":"Full earliest output"}),
    ];
    for index in 0..15 {
        blocks.push(json!({"id":format!("later-{index}"),"role":"user","text":"Later prompt","startedAt":1000+index}));
        blocks
            .push(json!({"id":format!("answer-{index}"),"role":"assistant","text":"Later answer"}));
    }
    store.shared_store_blocks(id, &blocks).unwrap();
    drop(store);
    let store = crate::store::Store::open_desktop(&path).unwrap();
    let viewport = store.load(id).unwrap();
    assert!(!viewport
        .rows
        .iter()
        .any(|row| row.text.contains("Full earliest output")));
    let result = store.app_turn_result(id, "early").unwrap().unwrap();
    assert_eq!(result.prompt_id, "root");
    assert_eq!(result.turn, 1);
    assert_eq!(result.text, "Full earliest output");
}
