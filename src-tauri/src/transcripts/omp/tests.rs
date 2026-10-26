use super::*;

use crate::test_support::tmp;

fn assistant_text(text: &str, concat: &str) -> OmpAssistantText {
    OmpAssistantText {
        text: text.into(),
        concat: concat.into(),
    }
}

#[test]
fn omp_active_assistant_texts_keep_active_message_order_with_both_forms() {
    let dir = tmp("omp-active-texts");
    let path = dir.0.join("session.jsonl");
    let records = [
        serde_json::json!({"type":"message","id":"u","message":{"role":"user","content":"User only"}}),
        serde_json::json!({"type":"message","id":"abandoned","parentId":"u","message":{"role":"assistant","content":"Off branch"}}),
        serde_json::json!({"type":"message","id":"a","parentId":"u","message":{"role":"assistant","content":[{"type":"text","text":"First."},{"type":"thinking","thinking":"Hidden"},{"type":"text","text":"Second."}]}}),
        serde_json::json!({"type":"message","id":"tool","parentId":"a","message":{"role":"assistant","content":[{"type":"toolCall","name":"read"}]}}),
        serde_json::json!({"type":"message","id":"b","parentId":"tool","message":{"role":"assistant","content":"Plain"}}),
        serde_json::json!({"type":"custom_message","id":"note","parentId":"b","content":"Note only"}),
    ];
    let jsonl = records.iter().map(|v| format!("{v}\n")).collect::<String>();
    std::fs::write(&path, jsonl).unwrap();
    assert_eq!(
        active_omp_assistant_texts(&path).unwrap(),
        [
            assistant_text("First.\nSecond.", "First.Second."),
            assistant_text("Plain", "Plain"),
        ]
    );
}

#[test]
fn omp_active_assistant_texts_repeat_equal_messages_in_file_order() {
    let dir = tmp("omp-active-texts-repeats");
    let path = dir.0.join("session.jsonl");
    let records = [
        serde_json::json!({"type":"message","id":"a","message":{"role":"assistant","content":"First."}}),
        serde_json::json!({"type":"message","id":"off","parentId":"a","message":{"role":"assistant","content":"First.Second."}}),
        serde_json::json!({"type":"message","id":"b","parentId":"a","message":{"role":"assistant","content":[{"type":"text","text":"Second."}]}}),
        serde_json::json!({"type":"message","id":"c","parentId":"b","message":{"role":"assistant","content":"First.Second."}}),
        serde_json::json!({"type":"message","id":"d","parentId":"c","message":{"role":"assistant","content":"First.Second."}}),
    ];
    std::fs::write(
        &path,
        records.iter().map(|v| format!("{v}\n")).collect::<String>(),
    )
    .unwrap();
    assert_eq!(
        active_omp_assistant_texts(&path).unwrap(),
        [
            assistant_text("First.", "First."),
            assistant_text("Second.", "Second."),
            assistant_text("First.Second.", "First.Second."),
            assistant_text("First.Second.", "First.Second."),
        ]
    );
}
