use super::*;

use crate::test_support::tmp;

#[test]
fn omp_interjections_require_displayed_assistant_anchors() {
    let dir = tmp("omp-interjections");
    let path = dir.0.join("session.jsonl");
    std::fs::write(
            &path,
            concat!(
                "{\"type\":\"message\",\"id\":\"u\",\"message\":{\"role\":\"user\",\"content\":\"Go\"}}\n",
                "{\"type\":\"custom_message\",\"id\":\"orphan\",\"parentId\":\"u\",\"display\":true}\n",
                "{\"type\":\"message\",\"id\":\"a1\",\"parentId\":\"orphan\",\"message\":{\"role\":\"assistant\",\"content\":[{\"type\":\"text\",\"text\":\"Answer\"}]}}\n",
                "{\"type\":\"custom_message\",\"id\":\"hidden\",\"parentId\":\"a1\",\"display\":false}\n",
                "invalid partial line\n",
                "{\"type\":\"message\",\"id\":\"a2\",\"parentId\":\"hidden\",\"message\":{\"role\":\"assistant\",\"content\":[{\"type\":\"text\",\"text\":\"Answer\"}]}}\n",
                "{\"type\":\"custom_message\",\"id\":\"review\",\"parentId\":\"a2\",\"display\":true,\"customType\":\"advisor\",\"details\":{\"notes\":[{\"note\":\"First\",\"severity\":\"nit\"},{\"note\":\"Second\",\"severity\":\"blocker\"}]}}\n",
                "{\"type\":\"message\",\"id\":\"a3\",\"parentId\":\"review\",\"message\":{\"role\":\"assistant\",\"content\":[{\"type\":\"text\",\"text\":\"Checked\"}]}}\n",
            ),
        )
        .unwrap();
    let anchors = parse_omp_interjections(&path).unwrap();
    assert_eq!(anchors.len(), 1);
    assert_eq!(anchors[0].after_assistant_text, "Answer");
    assert_eq!(anchors[0].after_occurrence, 2);
    assert_eq!(
        anchors[0].following_assistant_text.as_deref(),
        Some("Checked")
    );
    assert_eq!(anchors[0].text, "First\n\nSecond");
    assert_eq!(anchors[0].severity.as_deref(), Some("blocker"));
}

#[test]
fn omp_interjections_do_not_coalesce_across_reasoning() {
    let dir = tmp("omp-interjections-reasoning");
    let path = dir.0.join("session.jsonl");
    std::fs::write(
            &path,
            concat!(
                "{\"type\":\"message\",\"id\":\"a\",\"message\":{\"role\":\"assistant\",\"content\":\"Answer\"}}\n",
                "{\"type\":\"custom_message\",\"id\":\"review\",\"parentId\":\"a\",\"display\":true,\"content\":\"Check\"}\n",
                "{\"type\":\"message\",\"id\":\"b\",\"parentId\":\"review\",\"message\":{\"role\":\"assistant\",\"content\":[{\"type\":\"thinking\",\"thinking\":\"Wait\"},{\"type\":\"text\",\"text\":\"Checked\"}]}}\n",
            ),
        )
        .unwrap();
    let anchors = parse_omp_interjections(&path).unwrap();
    assert_eq!(anchors[0].following_assistant_text, None);
    assert_eq!(anchors[0].text, "Check");
}
#[test]
fn omp_interjections_follow_active_ancestry_and_keep_text_forms() {
    let dir = tmp("omp-interjections-ancestry");
    let path = dir.0.join("session.jsonl");
    std::fs::write(
            &path,
            concat!(
                "{\"type\":\"message\",\"id\":\"a\",\"message\":{\"role\":\"assistant\",\"content\":[{\"type\":\"text\",\"text\":\"One\"},{\"type\":\"text\",\"text\":\"Two\"}]}}\n",
                "{\"type\":\"custom_message\",\"id\":\"abandoned\",\"parentId\":\"a\",\"display\":true,\"content\":\"Wrong branch\"}\n",
                "{\"type\":\"message\",\"id\":\"t\",\"parentId\":\"a\",\"message\":{\"role\":\"toolResult\",\"content\":\"Done\"}}\n",
                "{\"type\":\"custom_message\",\"id\":\"first\",\"parentId\":\"t\",\"display\":true,\"content\":\"First\"}\n",
                "{\"type\":\"custom_message\",\"id\":\"second\",\"parentId\":\"first\",\"display\":true,\"content\":\"Second\"}\n",
                "{\"type\":\"compaction\",\"id\":\"meta\",\"parentId\":\"second\"}\n",
                "{\"type\":\"custom_message\",\"id\":\"third\",\"parentId\":\"meta\",\"display\":true,\"content\":\"Third\"}\n",
                "{\"type\":\"message\",\"id\":\"b\",\"parentId\":\"third\",\"message\":{\"role\":\"assistant\",\"content\":[{\"type\":\"text\",\"text\":\"Three\"},{\"type\":\"text\",\"text\":\"Four\"}]}}\n",
            ),
        )
        .unwrap();
    let anchors = parse_omp_interjections(&path).unwrap();
    assert_eq!(
        anchors.iter().map(|a| a.id.as_str()).collect::<Vec<_>>(),
        ["first", "second", "third"]
    );
    for anchor in &anchors {
        assert_eq!(anchor.after_assistant_text, "One\nTwo");
        assert_eq!(anchor.after_assistant_text_concat, "OneTwo");
        assert_eq!(anchor.after_occurrence, 1);
        assert_eq!(anchor.after_concat_occurrence, 1);
    }
    assert_eq!(anchors[0].following_assistant_text, None);
    assert_eq!(anchors[1].following_assistant_text, None);
    assert_eq!(
        anchors[2].following_assistant_text.as_deref(),
        Some("Three\nFour")
    );
    assert_eq!(
        anchors[2].following_assistant_text_concat.as_deref(),
        Some("ThreeFour")
    );
}

#[test]
fn omp_interjections_do_not_cross_users_or_empty_assistant_messages() {
    let dir = tmp("omp-interjections-barriers");
    let path = dir.0.join("session.jsonl");
    for role in ["user", "assistant"] {
        let records = [
            serde_json::json!({"type":"message","id":"a","message":{"role":"assistant","content":"Earlier"}}),
            serde_json::json!({"type":"message","id":"barrier","parentId":"a","message":{"role":role,"content":[]}}),
            serde_json::json!({"type":"message","id":"tool","parentId":"barrier","message":{"role":"toolResult","content":"Done"}}),
            serde_json::json!({"type":"custom_message","id":"note","parentId":"tool","display":true,"content":"Note"}),
        ];
        let jsonl = records.map(|record| record.to_string()).join("\n");
        std::fs::write(&path, jsonl).unwrap();
        assert!(parse_omp_interjections(&path).unwrap().is_empty());
    }
}
