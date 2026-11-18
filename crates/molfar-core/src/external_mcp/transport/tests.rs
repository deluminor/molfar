use super::{Authenticate, Server};
use crate::external_mcp::{
    grants::types::{DOMAIN, GRANT},
    types::{AuditEntry, Principal},
};
use serde_json::{json, Value};
use std::sync::Arc;

fn principal(grants: &[GRANT]) -> Principal {
    Principal {
        client_id: "client".into(),
        name: "OpenBot".into(),
        grants: grants.to_vec(),
        resources: vec![],
        projects: vec!["/project".into()],
    }
}

fn audit() -> super::Audit {
    Arc::new(|_: AuditEntry| Ok(()))
}

fn start() -> (Server, String, async_channel::Receiver<super::Call>) {
    let authenticate: Authenticate = Arc::new(|token| {
        Ok(match token {
            "reader" => Some(principal(&[
                GRANT::Read(DOMAIN::Board),
                GRANT::Read(DOMAIN::Sessions),
            ])),
            "writer" => Some(principal(&[GRANT::Write(DOMAIN::Sessions)])),
            _ => None,
        })
    });
    let (server, calls) = Server::start(0, authenticate, audit()).unwrap();
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
    assert_eq!(tools["result"]["tools"].as_array().unwrap().len(), 7);
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
        .contains("permission for sessions_start"));
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

    let conflict = Server::start(port, authenticate.clone(), audit());
    drop(server);

    assert!(conflict.err().unwrap().contains("Cannot listen"));
    assert!(ureq::post(&url)
        .timeout(std::time::Duration::from_secs(2))
        .send_string("{}")
        .is_err());
    let (restarted, _) = Server::start(port, authenticate, audit()).unwrap();
    assert_eq!(restarted.address().port(), port);
}

#[test]
fn revocation_applies_to_the_next_request_on_the_same_connection_pool() {
    let revoked = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let flag = revoked.clone();
    let authenticate: Authenticate = Arc::new(move |token| {
        Ok(
            (token == "reader" && !flag.load(std::sync::atomic::Ordering::SeqCst))
                .then(|| principal(&[GRANT::Read(DOMAIN::Board), GRANT::Read(DOMAIN::Sessions)])),
        )
    });
    let (server, calls) = Server::start(0, authenticate, audit()).unwrap();
    echo(calls);
    let url = format!("http://127.0.0.1:{}/mcp", server.address().port());
    let list = json!({"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}).to_string();

    let before = post(&url, Some("reader"), &list, &[]);
    revoked.store(true, std::sync::atomic::Ordering::SeqCst);
    let after = post(&url, Some("reader"), &list, &[]);

    assert_eq!(before.0, 200);
    assert_eq!(after.0, 401);
}

#[test]
fn tools_list_is_filtered_and_denials_are_audited() {
    let authenticate: Authenticate = Arc::new(|token| {
        Ok(match token {
            "board" => Some(principal(&[GRANT::Read(DOMAIN::Board)])),
            "empty" => Some(principal(&[])),
            _ => None,
        })
    });
    let (send, received) = std::sync::mpsc::channel();
    let audit: super::Audit =
        Arc::new(move |entry| send.send(entry).map_err(|error| error.to_string()));
    let (server, calls) = Server::start(0, authenticate, audit).unwrap();
    let url = format!("http://{}/mcp", server.address());
    let result = rpc(&url, "board", "tools/list", json!({}));
    let names: Vec<_> = result["result"]["tools"]
        .as_array()
        .unwrap()
        .iter()
        .map(|tool| tool["name"].as_str().unwrap())
        .collect();
    assert_eq!(
        names,
        [
            "projects_list",
            "board_list",
            "board_read",
            "board_artifacts_list",
            "board_artifacts_read"
        ]
    );
    assert_eq!(
        rpc(&url, "empty", "tools/list", json!({}))["result"]["tools"],
        json!([])
    );

    let denied = call_tool(
        &url,
        "board",
        "board_update",
        json!({
            "cardId":"card-1", "title":"private content", "requestId":"r"
        }),
    );
    assert_eq!(denied["result"]["isError"], true);
    assert!(calls.is_empty());
    let entry = received.try_recv().unwrap();
    assert_eq!(entry.action, "board_update");
    assert_eq!(entry.client_id, "client");
    assert_eq!(entry.request_id.as_deref(), Some("r"));
    assert_eq!(entry.outcome, "denied");
    assert_eq!(entry.kind, Default::default());
    assert!(!serde_json::to_string(&entry)
        .unwrap()
        .contains("private content"));
}
