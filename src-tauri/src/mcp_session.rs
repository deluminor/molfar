//! Build ACP `mcpServers` payloads for harness sessions (disk locals + molfar-connectors).

use std::path::Path;

use serde::Serialize;
use serde_json::{json, Value};

use crate::dirs_home;
use crate::fs::expand_home;
use crate::jira;

const MOLFAR_CONNECTORS: &str = "molfar-connectors";

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionMcpServersPayload {
    provider_local: Vec<Value>,
    molfar_connectors: Option<Value>,
}

#[tauri::command]
pub async fn session_mcp_servers(
    provider: String,
    cwd: String,
) -> Result<SessionMcpServersPayload, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let home = dirs_home().ok_or("Home directory not found")?;
        let project = expand_home(&cwd);
        let provider_local = provider_local_servers(&provider, Path::new(&home), &project);
        let molfar_connectors = molfar_connectors_entry()?;
        Ok(SessionMcpServersPayload {
            provider_local,
            molfar_connectors,
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

fn molfar_connectors_entry() -> Result<Option<Value>, String> {
    if !jira::is_connected_on_disk() {
        return Ok(None);
    }
    let command = std::env::current_exe()
        .map_err(|error| error.to_string())?
        .to_string_lossy()
        .into_owned();
    Ok(Some(json!({
        "name": MOLFAR_CONNECTORS,
        "command": command,
        "args": ["connectors-mcp"],
        "env": [],
    })))
}

fn provider_local_servers(provider: &str, home: &Path, project: &Path) -> Vec<Value> {
    let mut servers = Vec::new();
    match provider {
        "cursor" => {
            collect_json_file(&mut servers, &home.join(".cursor/mcp.json"), "mcpServers");
            for directory in project_ancestors(project, home) {
                collect_json_file(
                    &mut servers,
                    &directory.join(".cursor/mcp.json"),
                    "mcpServers",
                );
            }
        }
        "claude" => {
            let claude = home.join(".claude.json");
            if let Some(config) = read_json(&claude) {
                collect_servers(&mut servers, config.get("mcpServers"));
                collect_servers(
                    &mut servers,
                    config
                        .get("projects")
                        .and_then(|projects| projects.get(project.to_string_lossy().as_ref()))
                        .and_then(|entry| entry.get("mcpServers")),
                );
            }
            for directory in project_ancestors(project, home) {
                collect_json_file(&mut servers, &directory.join(".mcp.json"), "mcpServers");
            }
        }
        _ => {}
    }
    servers
}

fn project_ancestors<'a>(project: &'a Path, home: &Path) -> Vec<&'a Path> {
    let mut dirs = Vec::new();
    for directory in project.ancestors() {
        if directory == home {
            break;
        }
        dirs.push(directory);
        if directory.join(".git").exists() {
            break;
        }
    }
    dirs
}

fn collect_json_file(servers: &mut Vec<Value>, path: &Path, key: &str) {
    if let Some(config) = read_json(path) {
        collect_servers(servers, config.get(key));
    }
}

fn collect_servers(servers: &mut Vec<Value>, value: Option<&Value>) {
    let Some(object) = value.and_then(Value::as_object) else {
        return;
    };
    for (name, config) in object {
        if !config.is_object() {
            continue;
        }
        if config.get("enabled").and_then(Value::as_bool) == Some(false)
            || config.get("disabled").and_then(Value::as_bool) == Some(true)
        {
            continue;
        }
        if let Some(entry) = to_acp_server(name, config) {
            // Later scopes override earlier same-name entries.
            servers.retain(|existing| existing.get("name").and_then(Value::as_str) != Some(name));
            servers.push(entry);
        }
    }
}

fn to_acp_server(name: &str, config: &Value) -> Option<Value> {
    if let Some(command) = config.get("command").and_then(Value::as_str) {
        if command.trim().is_empty() {
            return None;
        }
        let args = config
            .get("args")
            .and_then(Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .filter_map(Value::as_str)
                    .map(str::to_owned)
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        let env = env_entries(config.get("env"));
        return Some(json!({
            "name": name,
            "command": command,
            "args": args,
            "env": env,
        }));
    }

    let url = config.get("url").and_then(Value::as_str)?;
    if url.trim().is_empty() {
        return None;
    }
    let transport = config.get("type").and_then(Value::as_str).unwrap_or("http");
    let type_name = if transport == "sse" { "sse" } else { "http" };
    let headers = header_entries(config.get("headers"));
    Some(json!({
        "name": name,
        "type": type_name,
        "url": url,
        "headers": headers,
    }))
}

fn env_entries(value: Option<&Value>) -> Vec<Value> {
    let Some(object) = value.and_then(Value::as_object) else {
        return Vec::new();
    };
    object
        .iter()
        .filter_map(|(name, entry)| {
            entry.as_str().map(|value| {
                json!({
                    "name": name,
                    "value": value,
                })
            })
        })
        .collect()
}

fn header_entries(value: Option<&Value>) -> Vec<Value> {
    match value {
        Some(Value::Object(object)) => object
            .iter()
            .filter_map(|(name, entry)| {
                entry.as_str().map(|value| {
                    json!({
                        "name": name,
                        "value": value,
                    })
                })
            })
            .collect(),
        Some(Value::Array(items)) => items
            .iter()
            .filter_map(|item| {
                let name = item.get("name").and_then(Value::as_str)?;
                let value = item.get("value").and_then(Value::as_str)?;
                Some(json!({ "name": name, "value": value }))
            })
            .collect(),
        _ => Vec::new(),
    }
}

fn read_json(path: &Path) -> Option<Value> {
    let raw = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw)
        .or_else(|_| serde_json::from_str(&strip_jsonc(&raw)))
        .ok()
}

/// Remove JSONC comments and trailing commas without touching quoted text.
fn strip_jsonc(raw: &str) -> String {
    let bytes = raw.as_bytes();
    let mut clean = Vec::with_capacity(bytes.len());
    let mut index = 0;
    let mut quoted = false;
    while index < bytes.len() {
        let byte = bytes[index];
        if quoted {
            clean.push(byte);
            if byte == b'\\' && index + 1 < bytes.len() {
                index += 1;
                clean.push(bytes[index]);
            } else if byte == b'"' {
                quoted = false;
            }
        } else if byte == b'"' {
            quoted = true;
            clean.push(byte);
        } else if byte == b'/' && bytes.get(index + 1) == Some(&b'/') {
            index += 2;
            while index < bytes.len() && bytes[index] != b'\n' {
                index += 1;
            }
            clean.push(b'\n');
        } else if byte == b'/' && bytes.get(index + 1) == Some(&b'*') {
            index += 2;
            while index + 1 < bytes.len() && !(bytes[index] == b'*' && bytes[index + 1] == b'/') {
                index += 1;
            }
            index = (index + 1).min(bytes.len() - 1);
        } else {
            clean.push(byte);
        }
        index += 1;
    }
    let mut result = Vec::with_capacity(clean.len());
    quoted = false;
    let mut escaped = false;
    for (index, byte) in clean.iter().enumerate() {
        if quoted {
            if escaped {
                escaped = false;
            } else if *byte == b'\\' {
                escaped = true;
            } else if *byte == b'"' {
                quoted = false;
            }
        } else if *byte == b'"' {
            quoted = true;
        }
        if !quoted
            && *byte == b','
            && clean[index + 1..]
                .iter()
                .find(|b| !b.is_ascii_whitespace())
                .is_some_and(|b| *b == b'}' || *b == b']')
        {
            continue;
        }
        result.push(*byte);
    }
    String::from_utf8(result).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn to_acp_stdio_maps_env_object() {
        let config = json!({
            "command": "npx",
            "args": ["-y", "pkg"],
            "env": { "TOKEN": "x" }
        });
        let entry = to_acp_server("docs", &config).unwrap();
        assert_eq!(entry["name"], "docs");
        assert_eq!(entry["command"], "npx");
        assert_eq!(entry["args"], json!(["-y", "pkg"]));
        assert_eq!(entry["env"], json!([{ "name": "TOKEN", "value": "x" }]));
        assert!(entry.get("type").is_none());
    }

    #[test]
    fn to_acp_http_maps_headers() {
        let config = json!({
            "url": "https://example.com/mcp",
            "type": "http",
            "headers": { "Authorization": "Bearer t" }
        });
        let entry = to_acp_server("remote", &config).unwrap();
        assert_eq!(entry["type"], "http");
        assert_eq!(
            entry["headers"],
            json!([{ "name": "Authorization", "value": "Bearer t" }])
        );
    }

    #[test]
    fn disabled_servers_are_skipped() {
        let mut servers = Vec::new();
        collect_servers(
            &mut servers,
            Some(&json!({
                "on": { "command": "node", "args": ["a.js"] },
                "off": { "command": "node", "args": ["b.js"], "enabled": false }
            })),
        );
        assert_eq!(servers.len(), 1);
        assert_eq!(servers[0]["name"], "on");
    }

    #[test]
    fn molfar_connectors_entry_has_no_secret_fields_when_disconnected() {
        // Without a real vault file, entry is None — no token leakage path.
        let entry = molfar_connectors_entry().unwrap();
        if let Some(value) = entry {
            let text = value.to_string();
            assert!(!text.to_ascii_lowercase().contains("token"));
            assert_eq!(value["name"], MOLFAR_CONNECTORS);
            assert_eq!(value["args"], json!(["connectors-mcp"]));
            assert_eq!(value["env"], json!([]));
            assert!(value.get("type").is_none());
        }
    }

    #[test]
    fn cursor_project_mcp_json_is_collected() {
        let root = std::env::temp_dir().join(format!("molfar-mcp-session-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join(".cursor")).unwrap();
        fs::write(
            root.join(".cursor/mcp.json"),
            r#"{"mcpServers":{"docs":{"command":"npx","args":["server"]}}}"#,
        )
        .unwrap();
        let home = root.join("home");
        fs::create_dir_all(&home).unwrap();
        let servers = provider_local_servers("cursor", &home, &root);
        assert_eq!(servers.len(), 1);
        assert_eq!(servers[0]["name"], "docs");
        let _ = fs::remove_dir_all(&root);
    }
}
