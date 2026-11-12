use super::*;

#[test]
fn claude_result_preserves_zero_absence_and_replay_identity() {
    let mut protocol = Protocol::new(Request {
        kind: Kind::Claude,
        binary: "unused".into(),
        cwd: "/tmp".into(),
        prompt: "Hello".into(),
        provider_id: None,
        model: None,
        settings: Default::default(),
    });
    let frame = json!({"type":"result","subtype":"success","uuid":"result-1",
        "usage":{"input_tokens":0,"output_tokens":7},
        "modelUsage":{"actual-model":{}}});
    for _ in 0..2 {
        let events = protocol.frame(frame.clone(), &mut Vec::new()).unwrap();
        let usage = events
            .iter()
            .find_map(|event| match event {
                Event::Consumption(usage) => Some(usage),
                _ => None,
            })
            .expect("authoritative result usage");
        assert_eq!(usage.source_key, "result-1");
        assert_eq!(usage.input, Some(0));
        assert_eq!(usage.output, Some(7));
        assert_eq!(usage.cache_read, None);
        assert_eq!(usage.model.as_deref(), Some("actual-model"));
    }
}

#[test]
fn claude_accounting_rejects_invalid_counts_and_avoids_invented_provenance() {
    let base = json!({"type":"result","uuid":"result-2","usage":{"output_tokens":0},
        "modelUsage":{"first":{},"second":{}}});
    let snapshot = consumption::claude_result(&base).unwrap().unwrap();
    assert_eq!(snapshot.model, None);
    assert_eq!(snapshot.input, None);
    assert_eq!(snapshot.output, Some(0));
    let mut invalid = base.clone();
    invalid["usage"]["output_tokens"] = json!(-1);
    assert!(consumption::claude_result(&invalid)
        .unwrap_err()
        .contains("output_tokens"));
    invalid["usage"]["output_tokens"] = json!(u64::MAX);
    assert!(consumption::claude_result(&invalid).is_err());
    let mut child = base.clone();
    child["parent_tool_use_id"] = json!("child");
    assert!(consumption::claude_result(&child).unwrap().is_none());
    let mut anonymous = base;
    anonymous.as_object_mut().unwrap().remove("uuid");
    assert!(consumption::claude_result(&anonymous).unwrap().is_none());
}
