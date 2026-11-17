use super::{Authenticate, Server};
use crate::external_mcp::types::{Principal, SCOPE};
use serde_json::{json, Value};
use std::sync::Arc;

fn principal(scopes: &[SCOPE]) -> Principal {
    Principal {
        client_id: "client".into(),
        name: "OpenBot".into(),
        scopes: scopes.to_vec(),
        projects: vec!["/project".into()],
    }
}

fn start() -> (Server, String, async_channel::Receiver<super::Call>) {
    let authenticate: Authenticate = Arc::new(|token| {
        Ok(match token {
            "reader" => Some(principal(&[SCOPE::Read])),
            "writer" => Some(principal(&SCOPE::ALL)),
            _ => None,
        })
    });
    let (server, calls) = Server::start(0, authenticate).unwrap();
    let url = format!("http://127.0.0.1:{}/mcp", server.address().port());
    (server, url, calls)
}

fn echo(calls: async_channel::Receiver<super::Call>) {
    std::thread::spawn(move || {
        while let Ok(call) = calls.recv_blocking() {
            let _ = call
                .reply
                .send(Ok(json!({"tool":call.tool,"arguments":call.arguments})));
        }
    });
}

fn post(url: &str, token: Option<&str>, body: &str, headers: &[(&str, &str)]) -> (u16, String) {
    let mut request = ureq::post(url)
        .set("Content-Type", "application/json")
        .set("Accept", "application/json, text/event-stream")
        .timeout(std::time::Duration::from_secs(10));
    if let Some(token) = token {
        request = request.set("Authorization", &format!("Bearer {token}"));
    }
    for (name, value) in headers {
        request = request.set(name, value);
    }
    match request.send_string(body) {
        Ok(response) => (response.status(), response.into_string().unwrap()),
        Err(ureq::Error::Status(status, response)) => (status, response.into_string().unwrap()),
        Err(error) => panic!("{error}"),
    }
}

fn rpc(url: &str, token: &str, method: &str, params: Value) -> Value {
    let body = json!({"jsonrpc":"2.0","id":1,"method":method,"params":params}).to_string();
    let (status, text) = post(
        url,
        Some(token),
        &body,
        &[("MCP-Protocol-Version", "2025-06-18")],
    );
    assert_eq!(status, 200, "{text}");
    serde_json::from_str(&text).unwrap()
}

fn call_tool(url: &str, token: &str, name: &str, arguments: Value) -> Value {
    rpc(
        url,
        token,
        "tools/call",
        json!({"name":name,"arguments":arguments}),
    )
}

#[test]
fn authenticated_clients_negotiate_list_tools_and_reach_the_application() {
    let (_server, url, calls) = start();
    echo(calls);

    let initialize = json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1"}}});
    let (status, text) = post(&url, Some("reader"), &initialize.to_string(), &[]);
    let tools = rpc(&url, "reader", "tools/list", json!({}));
    let listed = call_tool(&url, "reader", "projects_list", json!({}));

    assert_eq!(status, 200, "{text}");
    let initialized: Value = serde_json::from_str(&text).unwrap();
    assert_eq!(initialized["result"]["protocolVersion"], "2025-06-18");
    assert_eq!(tools["result"]["tools"].as_array().unwrap().len(), 9);
    assert_eq!(listed["result"]["isError"], false);
    let echoed: Value =
        serde_json::from_str(listed["result"]["content"][0]["text"].as_str().unwrap()).unwrap();
    assert_eq!(echoed["tool"], "projects_list");
}

#[test]
fn credentials_scopes_and_arguments_are_checked_before_dispatch() {
    let (_server, url, calls) = start();
    let list = json!({"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}).to_string();

    let missing = post(&url, None, &list, &[]);
    let invalid = post(&url, Some("forged"), &list, &[]);
    let denied = call_tool(
        &url,
        "reader",
        "sessions_start",
        json!({"project":"/project","prompt":"x","requestId":"r"}),
    );
    let unknown = call_tool(&url, "writer", "projects_list", json!({"extra":true}));

    assert_eq!(missing.0, 401);
    assert_eq!(invalid.0, 401);
    assert_eq!(denied["result"]["isError"], true);
    assert!(denied["result"]["content"][0]["text"]
        .as_str()
        .unwrap()
        .contains("submit scope"));
    assert!(unknown["error"].is_object(), "{unknown}");
    assert!(calls.try_recv().is_err(), "nothing reached the application");
}

#[test]
fn transport_rejects_bad_hosts_origins_bodies_versions_and_json() {
    let (server, url, _calls) = start();
    let list = json!({"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}).to_string();
    let port = server.address().port();

    let host = post(&url, Some("reader"), &list, &[("Host", "attacker.example")]);
    let origin = post(
        &url,
        Some("reader"),
        &list,
        &[("Origin", "https://attacker.example")],
    );
    let version = post(
        &url,
        Some("reader"),
        &list,
        &[("MCP-Protocol-Version", "1999-01-01")],
    );
    let malformed = post(&url, Some("reader"), "{not json", &[]);
    let oversized = post(&url, Some("reader"), &" ".repeat(1024 * 1024 + 1), &[]);
    let local = post(
        &url,
        Some("reader"),
        &list,
        &[("Host", &format!("localhost:{port}"))],
    );

    for (name, (status, _)) in [
        ("host", &host),
        ("origin", &origin),
        ("version", &version),
        ("json", &malformed),
    ] {
        assert!((400..500).contains(status), "{name}: {status}");
    }
    assert_eq!(oversized.0, 413);
    assert_eq!(local.0, 200, "{}", local.1);
}

#[test]
fn port_conflicts_fail_fast_and_dropping_the_server_closes_the_listener() {
    let (server, url, _calls) = start();
    let port = server.address().port();
    let authenticate: Authenticate = Arc::new(|_| Ok(None));

    let conflict = Server::start(port, authenticate.clone());
    drop(server);

    assert!(conflict.err().unwrap().contains("Cannot listen"));
    assert!(ureq::post(&url)
        .timeout(std::time::Duration::from_secs(2))
        .send_string("{}")
        .is_err());
    let (restarted, _) = Server::start(port, authenticate).unwrap();
    assert_eq!(restarted.address().port(), port);
}
