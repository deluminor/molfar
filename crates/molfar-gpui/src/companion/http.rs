use super::{
    gateway,
    types::{Host, PROTOCOL_VERSION},
};
use serde_json::{Value, json};
use std::{
    io::Read,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
        mpsc,
    },
    time::Duration,
};

pub(super) const WORKERS: usize = 8;
const SMALL_BODY: u64 = 1024;
const RPC_BODY: u64 = 64 * 1024 * 1024;
const RPC_TIMEOUT: Duration = Duration::from_secs(30);
const PENDING_MAX: usize = 32;

pub(crate) struct Job {
    pub permit: super::permit::Permit,
    pub action: String,
    pub input: Value,
    pub reply: mpsc::Sender<Value>,
}

pub(super) struct Reply {
    pub status: u16,
    pub body: Value,
}

impl Reply {
    pub(super) fn ok(body: Value) -> Self {
        Self { status: 200, body }
    }

    pub(super) fn error(status: u16, message: &str) -> Self {
        Self {
            status,
            body: json!({"ok": false, "error": message}),
        }
    }
}

pub(super) fn worker(server: Arc<tiny_http::Server>, stopped: Arc<AtomicBool>, host: Host) {
    while !stopped.load(Ordering::SeqCst) {
        let request = match server.recv_timeout(Duration::from_millis(250)) {
            Ok(Some(request)) => request,
            Ok(None) => continue,
            Err(error) => {
                eprintln!("molfar: Companion listener failed: {error}");
                return;
            }
        };
        if stopped.load(Ordering::SeqCst) {
            return;
        }
        serve(&host, request, &stopped);
    }
}

fn serve(host: &Host, mut request: tiny_http::Request, stopped: &Arc<AtomicBool>) {
    let streamed = body_is_streamed(&request);
    let reply = route(host, &mut request, stopped);

    // tiny_http drains an unread body when the request drops and sets no socket
    // timeout, so a stalled client would pin this worker even after the reply.
    if streamed {
        std::thread::spawn(move || respond(request, reply));
    } else {
        respond(request, reply);
    }
}

fn respond(request: tiny_http::Request, reply: Reply) {
    let body = serde_json::to_vec(&reply.body).unwrap_or_default();
    let mut response = tiny_http::Response::from_data(body).with_status_code(reply.status);
    for (name, value) in [
        ("Content-Type", "application/json; charset=utf-8"),
        ("Cache-Control", "no-store"),
        ("X-Content-Type-Options", "nosniff"),
    ] {
        if let Ok(header) = tiny_http::Header::from_bytes(name.as_bytes(), value.as_bytes()) {
            response.add_header(header);
        }
    }
    let _ = request.respond(response);
}

fn route(host: &Host, request: &mut tiny_http::Request, stopped: &Arc<AtomicBool>) -> Reply {
    let method = request.method().clone();
    let path = request.url().split('?').next().unwrap_or("").to_string();
    match (method, path.as_str()) {
        (tiny_http::Method::Get, "/v1/hello") => {
            let device = bearer(request).and_then(|token| gateway::touch_seen(host, token));
            Reply::ok(json!({
                "ok": true,
                "app": "molfar",
                "protocol": PROTOCOL_VERSION,
                "paired": device.is_some(),
                "name": device.as_ref().map(|_| gateway::machine_name()),
            }))
        }
        (tiny_http::Method::Post, "/v1/pair") => {
            if body_is_streamed(request) {
                return Reply::error(413, "Request is too large");
            }
            match read_json(request, SMALL_BODY) {
                Ok(body) => gateway::pair(host, &body),
                Err(reply) => reply,
            }
        }
        (method, route) => {
            let Some(token) = bearer(request) else {
                return Reply::error(401, "This device is not paired. Pair it again from MOLFAR.");
            };
            let Some(device) = gateway::touch_seen(host, token) else {
                return Reply::error(401, "This device is not paired. Pair it again from MOLFAR.");
            };
            match (method, route) {
                (tiny_http::Method::Get, "/v1/host") => host_stats(host),
                (tiny_http::Method::Post, "/v1/rpc") => match read_json(request, RPC_BODY) {
                    Ok(body) => rpc(host, &device, body, stopped),
                    Err(reply) => reply,
                },
                _ => Reply::error(404, "Unknown endpoint"),
            }
        }
    }
}

fn host_stats(host: &Host) -> Reply {
    let Ok(mut sampler) = host.sampler.lock() else {
        return Reply::error(500, "Host sampler is unavailable");
    };
    match sampler.sample() {
        Ok(stats) if stats.cpu_percent.is_some() => Reply::ok(json!({
            "ok": true,
            "result": {
                "cpuPercent": stats.cpu_percent,
                "memoryPercent": stats.memory_percent,
                "swapPercent": stats.swap_percent,
                "loadAverage": stats.load_average,
                "cpuCount": stats.cpu_count,
                "processCount": stats.process_count.unwrap_or(0),
            }
        })),
        Ok(_) => Reply::error(503, "Host metrics are warming up"),
        Err(error) => Reply::error(500, &error),
    }
}

fn rpc(host: &Host, device: &str, body: Value, stopped: &Arc<AtomicBool>) -> Reply {
    let action = body.get("action").and_then(Value::as_str).unwrap_or("");
    if action.is_empty() || action.len() > 64 {
        return Reply::error(400, "action is required");
    }
    let input = body.get("input").cloned().unwrap_or_else(|| json!({}));
    if !input.is_object() {
        return Reply::error(400, "input must be an object");
    }
    let Some(jobs) = gateway::jobs(host) else {
        return Reply::error(500, "Companion unavailable");
    };
    if jobs.len() >= PENDING_MAX {
        return Reply::error(429, "Too many requests in flight");
    }
    let permit = super::permit::Permit::new(host, device, RPC_TIMEOUT, stopped.clone());
    if let Err(error) = permit.check() {
        return Reply::error(503, &error);
    }
    let (tx, rx) = mpsc::channel();
    if jobs
        .try_send(Job {
            permit: permit.clone(),
            action: action.to_string(),
            input,
            reply: tx,
        })
        .is_err()
    {
        return Reply::error(503, "MOLFAR's main window is unavailable");
    }
    loop {
        match rx.recv_timeout(Duration::from_millis(50)) {
            Ok(value) if value.get("ok").and_then(Value::as_bool) == Some(true) => {
                return Reply::ok(value);
            }
            Ok(value) => {
                return Reply {
                    status: 422,
                    body: value,
                };
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {
                if let Err(error) = permit.check() {
                    permit.cancel();
                    return Reply::error(503, &error);
                }
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                permit.cancel();
                return Reply::error(503, "MOLFAR's main window is unavailable");
            }
        }
    }
}

fn bearer(request: &tiny_http::Request) -> Option<&str> {
    let token = header(request, "Authorization")?
        .strip_prefix("Bearer ")?
        .trim();
    (token.len() == 64).then_some(token)
}

fn header<'a>(request: &'a tiny_http::Request, name: &str) -> Option<&'a str> {
    request
        .headers()
        .iter()
        .find(|item| item.field.as_str().as_str().eq_ignore_ascii_case(name))
        .map(|item| item.value.as_str())
}

/// tiny_http buffers only plain bodies up to `SMALL_BODY` before queueing the
/// request; anything else is read from the socket by whichever thread touches it.
fn body_is_streamed(request: &tiny_http::Request) -> bool {
    header(request, "Expect").is_some()
        || header(request, "Transfer-Encoding").is_some()
        || request
            .body_length()
            .is_some_and(|len| len as u64 > SMALL_BODY)
}

fn read_json(request: &mut tiny_http::Request, limit: u64) -> Result<Value, Reply> {
    if request.body_length().is_some_and(|len| len as u64 > limit) {
        return Err(Reply::error(413, "Request is too large"));
    }
    let mut body = Vec::new();
    request
        .as_reader()
        .take(limit + 1)
        .read_to_end(&mut body)
        .map_err(|_| Reply::error(400, "Could not read the request"))?;
    if body.len() as u64 > limit {
        return Err(Reply::error(413, "Request is too large"));
    }
    serde_json::from_slice(&body).map_err(|_| Reply::error(400, "Request body must be JSON"))
}

#[cfg(all(test, any(target_os = "macos", target_os = "linux")))]
mod tests {
    use super::*;
    #[test]
    fn companion_host_poll_retains_cpu_baseline() {
        let root = std::env::temp_dir().join(format!("companion-sampler-{}", uuid::Uuid::new_v4()));
        let (host, _) = Host::open(root.join("companion.json")).unwrap();
        assert_eq!(host_stats(&host).status, 503);
        std::thread::sleep(Duration::from_millis(60));
        let reply = host_stats(&host);
        assert_eq!(reply.status, 200);
        assert!((0. ..=100.).contains(&reply.body["result"]["cpuPercent"].as_f64().unwrap()));
        host.shutdown();
    }
}
