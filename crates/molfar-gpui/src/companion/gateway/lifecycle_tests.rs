use super::*;
use std::{
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    time::{Duration, Instant},
};

fn first_reply(port: u16, request: &str) -> String {
    let mut client = TcpStream::connect((Ipv4Addr::LOCALHOST, port)).unwrap();
    client
        .set_read_timeout(Some(Duration::from_secs(3)))
        .unwrap();
    client.write_all(request.as_bytes()).unwrap();
    let mut buffer = [0; 64];
    let read = client.read(&mut buffer).unwrap();
    String::from_utf8_lossy(&buffer[..read]).into_owned()
}

#[test]
fn stalled_unauthenticated_bodies_never_pin_the_workers() {
    let port = TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
        .unwrap()
        .local_addr()
        .unwrap()
        .port();
    let root = std::env::temp_dir().join(format!("companion-stall-{}", uuid::Uuid::new_v4()));
    let (host, _jobs) = Host::open(root.join("companion.json")).unwrap();
    assert!(
        host.configure(true, BindMode::Serve, port, None)
            .unwrap()
            .running
    );

    let stalled = [
        ("/v1/pair", "Content-Length: 4096"),
        ("/v1/pair", "Transfer-Encoding: chunked"),
        ("/v1/pair", "Content-Length: 16\r\nExpect: 100-continue"),
        ("/v1/rpc", "Content-Length: 4096"),
    ];
    let mut held = Vec::new();
    for round in 0..3 * http::WORKERS {
        let (route, body_header) = stalled[round % stalled.len()];
        let mut client = TcpStream::connect((Ipv4Addr::LOCALHOST, port)).unwrap();
        client
            .set_read_timeout(Some(Duration::from_secs(3)))
            .unwrap();
        write!(
            client,
            "POST {route} HTTP/1.1\r\nHost: localhost\r\n{body_header}\r\n\r\n"
        )
        .unwrap();
        let mut buffer = [0; 64];
        let read = client.read(&mut buffer).unwrap();
        let reply = String::from_utf8_lossy(&buffer[..read]).into_owned();
        let expected = if route == "/v1/pair" {
            "HTTP/1.1 413"
        } else {
            "HTTP/1.1 401"
        };
        assert!(
            reply.starts_with(expected),
            "{route} {body_header}: {reply}"
        );
        held.push(client);
    }

    let hello = first_reply(
        port,
        "GET /v1/hello HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n",
    );
    assert!(hello.starts_with("HTTP/1.1 200"), "{hello}");

    drop(held);
    host.shutdown();
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn companion_restarts_while_an_old_request_is_pending() {
    let port = TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
        .unwrap()
        .local_addr()
        .unwrap()
        .port();
    let root = std::env::temp_dir().join(format!("companion-lifecycle-{}", uuid::Uuid::new_v4()));
    let (host, jobs) = Host::open(root.join("companion.json")).unwrap();
    let token = "a".repeat(64);
    host.inner.lock().unwrap().stored.devices.push(Device {
        id: "device".into(),
        name: "Fixture".into(),
        token_sha256: sha256_hex(&token),
        created_at: 0,
        last_seen_at: None,
    });
    assert!(
        host.configure(true, BindMode::Serve, port, None)
            .unwrap()
            .running
    );
    let mut client = TcpStream::connect((Ipv4Addr::LOCALHOST, port)).unwrap();
    client
        .set_read_timeout(Some(Duration::from_secs(3)))
        .unwrap();
    let body = r#"{"action":"session.options","input":{"project":"/fixture"}}"#;
    write!(client,"POST /v1/rpc HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer {token}\r\nConnection: close\r\nContent-Length: {}\r\n\r\n{body}",body.len()).unwrap();
    let deadline = Instant::now() + Duration::from_secs(3);
    let pending = loop {
        if let Ok(job) = jobs.try_recv() {
            break job;
        }
        assert!(
            Instant::now() < deadline,
            "the request must reach the shell queue"
        );
        std::thread::sleep(Duration::from_millis(5));
    };
    host.set_enabled(false, port).unwrap();
    let status = host.set_enabled(true, port).unwrap();
    assert!(status.running, "{:?}", status.error);
    assert!(pending.permit.check().is_err());
    let mut reply = String::new();
    client.read_to_string(&mut reply).unwrap();
    assert!(reply.starts_with("HTTP/1.1 503"), "{reply}");
    let mut next = TcpStream::connect((Ipv4Addr::LOCALHOST, port)).unwrap();
    next.set_read_timeout(Some(Duration::from_secs(3))).unwrap();
    write!(
        next,
        "GET /v1/hello HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n"
    )
    .unwrap();
    let mut reply = String::new();
    next.read_to_string(&mut reply).unwrap();
    assert!(reply.starts_with("HTTP/1.1 200"), "{reply}");
    host.inner.lock().unwrap().stored.devices[0].last_seen_at = None;
    let body = json!({"action":"session.options","input":{"project":"/fixture","padding":"x".repeat(2048)}}).to_string();
    let mut partial = TcpStream::connect((Ipv4Addr::LOCALHOST, port)).unwrap();
    partial
        .set_read_timeout(Some(Duration::from_secs(3)))
        .unwrap();
    write!(partial, "POST /v1/rpc HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer {token}\r\nConnection: close\r\nContent-Length: {}\r\n\r\n{}", body.len(), &body[..1]).unwrap();
    let deadline = Instant::now() + Duration::from_secs(3);
    while host.inner.lock().unwrap().stored.devices[0]
        .last_seen_at
        .is_none()
    {
        assert!(
            Instant::now() < deadline,
            "the old worker must accept the request"
        );
        std::thread::sleep(Duration::from_millis(5));
    }
    host.set_enabled(false, port).unwrap();
    assert!(host.set_enabled(true, port).unwrap().running);
    partial.write_all(&body.as_bytes()[1..]).unwrap();
    let mut reply = String::new();
    partial.read_to_string(&mut reply).unwrap();
    assert!(reply.starts_with("HTTP/1.1 503"), "{reply}");
    assert!(
        jobs.is_empty(),
        "the old generation must never reach the shell"
    );
    host.shutdown();
    std::fs::remove_dir_all(root).unwrap();
}
