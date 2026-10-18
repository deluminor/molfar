//! Stdio MCP server exposing MOLFAR Jira + Confluence tools.
//! Launch: `{molfar_exe} connectors-mcp`

mod tools;

use std::io::{self, BufRead, Write};

use serde_json::{json, Value};

use tools::{call_tool, tool_definitions};

/// Run the MCP JSON-RPC loop on stdin/stdout until EOF.
pub fn run() -> i32 {
    let stdin = io::stdin();
    let mut stdout = io::stdout();
    for line in stdin.lock().lines() {
        let line = match line {
            Ok(line) => line,
            Err(error) => {
                eprintln!("connectors-mcp read error: {error}");
                return 1;
            }
        };
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let message: Value = match serde_json::from_str(trimmed) {
            Ok(value) => value,
            Err(error) => {
                eprintln!("connectors-mcp invalid JSON: {error}");
                continue;
            }
        };
        if let Some(response) = handle_message(&message) {
            if let Err(error) = writeln!(stdout, "{response}") {
                eprintln!("connectors-mcp write error: {error}");
                return 1;
            }
            let _ = stdout.flush();
        }
    }
    0
}

fn handle_message(message: &Value) -> Option<String> {
    let method = message.get("method").and_then(Value::as_str)?;
    // Notifications have no id — acknowledge silently.
    let id = message.get("id").cloned()?;

    let result = match method {
        "initialize" => Ok(json!({
            "protocolVersion": message
                .pointer("/params/protocolVersion")
                .cloned()
                .unwrap_or_else(|| json!("2024-11-05")),
            "capabilities": { "tools": {} },
            "serverInfo": {
                "name": "molfar-connectors",
                "version": env!("CARGO_PKG_VERSION"),
            },
        })),
        "ping" => Ok(json!({})),
        "tools/list" => Ok(json!({ "tools": tool_definitions() })),
        "tools/call" => {
            let name = message
                .pointer("/params/name")
                .and_then(Value::as_str)
                .unwrap_or("");
            let arguments = message
                .pointer("/params/arguments")
                .cloned()
                .unwrap_or_else(|| json!({}));
            match call_tool(name, &arguments) {
                Ok(value) => Ok(json!({
                    "content": [{
                        "type": "text",
                        "text": serde_json::to_string_pretty(&value).unwrap_or_else(|_| value.to_string()),
                    }],
                    "isError": false,
                })),
                Err(error) => Ok(json!({
                    "content": [{ "type": "text", "text": error }],
                    "isError": true,
                })),
            }
        }
        _ => Err(json!({
            "code": -32601,
            "message": format!("Method not found: {method}"),
        })),
    };

    Some(match result {
        Ok(value) => json!({ "jsonrpc": "2.0", "id": id, "result": value }).to_string(),
        Err(error) => json!({ "jsonrpc": "2.0", "id": id, "error": error }).to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn initialize_returns_server_info() {
        let message = json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": { "protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": { "name": "test", "version": "0" } }
        });
        let response = handle_message(&message).expect("response");
        let parsed: Value = serde_json::from_str(&response).unwrap();
        assert_eq!(parsed["result"]["serverInfo"]["name"], "molfar-connectors");
        assert!(parsed["result"]["capabilities"]["tools"].is_object());
    }

    #[test]
    fn tools_list_includes_jira_and_confluence() {
        let message = json!({ "jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {} });
        let response = handle_message(&message).expect("response");
        let parsed: Value = serde_json::from_str(&response).unwrap();
        let names: Vec<&str> = parsed["result"]["tools"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|tool| tool.get("name").and_then(Value::as_str))
            .collect();
        assert!(names.contains(&"jira_list_projects"));
        assert!(names.contains(&"confluence_search"));
        assert!(names.contains(&"confluence_read"));
    }

    #[test]
    fn notifications_produce_no_response() {
        let message = json!({
            "jsonrpc": "2.0",
            "method": "notifications/initialized"
        });
        assert!(handle_message(&message).is_none());
    }
}
