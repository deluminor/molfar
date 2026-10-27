use super::*;

use std::collections::HashMap;

use crate::test_support::tmp;

#[test]
fn claude_shell_commands_match_only_requested_bash_tool_ids() {
    let dir = tmp("claude-shell-commands");
    let path = dir.0.join("session.jsonl");
    let records = [
        serde_json::json!({"type":"assistant","message":{"content":[
            {"type":"tool_use","id":"toolu_one","name":"Bash","input":{"command":"npm test"}},
            {"type":"tool_use","id":"toolu_read","name":"Read","input":{"command":"ignore"}}
        ]}}),
        serde_json::json!({"type":"assistant","message":{"content":[
            {"type":"tool_use","id":"toolu_two","name":"Bash","input":{"command":"git status"}}
        ]}}),
    ];
    std::fs::write(&path, records.map(|record| record.to_string()).join("\n")).unwrap();
    let commands =
        claude_shell_commands_from_file(&path, &["toolu_one".into(), "toolu_read".into()]).unwrap();
    assert_eq!(
        commands,
        HashMap::from([("toolu_one".into(), "npm test".into())])
    );
}
