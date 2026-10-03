//! Cursor and Antigravity plan usage for the Usage surface. Credentials are
//! read from the CLIs' own macOS Keychain items, used once, and never logged
//! or returned; the webview only receives the response body.

use std::path::PathBuf;
use std::time::Duration;

use base64::Engine;
use serde::Serialize;
use serde_json::Value;

use crate::dirs_home;

const HTTP_TIMEOUT: Duration = Duration::from_secs(10);
const CURSOR_USAGE_URL: &str =
    "https://api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage";
const ANTIGRAVITY_MODELS_URL: &str =
    "https://daily-cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels";
const GO_KEYRING_PREFIX: &str = "go-keyring-base64:";

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UsageFetch {
    pub status: String,
    pub http_status: Option<u16>,
    pub body: Option<String>,
    pub error: Option<String>,
}

fn fetch_result(
    status: &str,
    http_status: Option<u16>,
    body: Option<String>,
    error: Option<String>,
) -> UsageFetch {
    UsageFetch {
        status: status.into(),
        http_status,
        body,
        error,
    }
}

fn unavailable(reason: &str) -> UsageFetch {
    fetch_result("unavailable", None, None, Some(reason.into()))
}

fn http_error(provider: &str, status: u16) -> UsageFetch {
    let message = match status {
        401 => format!("{provider} sign-in expired"),
        403 => format!("{provider} usage is unavailable for this account"),
        _ => format!("{provider} usage request failed ({status})"),
    };
    fetch_result("error", Some(status), None, Some(message))
}

fn post_json(provider: &str, url: &str, token: &str, body: &str, connect: bool) -> UsageFetch {
    let agent = ureq::AgentBuilder::new().timeout(HTTP_TIMEOUT).build();
    let mut request = agent
        .post(url)
        .set("Authorization", &format!("Bearer {token}"))
        .set("Content-Type", "application/json");
    if connect {
        request = request.set("Connect-Protocol-Version", "1");
    }
    match request.send_string(body) {
        Ok(response) => {
            let status = response.status();
            match response.into_string() {
                Ok(text) => fetch_result("ok", Some(status), Some(text), None),
                Err(error) => fetch_result(
                    "error",
                    Some(status),
                    None,
                    Some(format!(
                        "{provider} usage response could not be read: {error}"
                    )),
                ),
            }
        }
        Err(ureq::Error::Status(status, response)) => {
            let _ = response.into_string();
            http_error(provider, status)
        }
        Err(error) => fetch_result(
            "error",
            None,
            None,
            Some(format!("{provider} usage request failed: {error}")),
        ),
    }
}

#[cfg(target_os = "macos")]
fn keychain_secret(service: &str, account: &str) -> Option<String> {
    use std::io::Read;
    use std::process::{Command, Stdio};
    use std::time::Instant;

    const KEYCHAIN_TIMEOUT: Duration = Duration::from_secs(5);
    let mut child = Command::new("security")
        .args(["find-generic-password", "-s", service, "-a", account, "-w"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) if status.success() => {
                let mut out = String::new();
                child.stdout.take()?.read_to_string(&mut out).ok()?;
                let secret = out.trim();
                return (!secret.is_empty()).then(|| secret.to_string());
            }
            Ok(Some(_)) | Err(_) => return None,
            Ok(None) if started.elapsed() > KEYCHAIN_TIMEOUT => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(25)),
        }
    }
}

#[cfg(not(target_os = "macos"))]
fn keychain_secret(_service: &str, _account: &str) -> Option<String> {
    None
}

fn fetch_cursor_usage_sync() -> UsageFetch {
    if !cfg!(target_os = "macos") {
        return unavailable("Cursor usage is only read on macOS");
    }
    let Some(token) = keychain_secret("cursor-access-token", "cursor-user") else {
        return unavailable("Cursor CLI not signed in");
    };
    post_json("Cursor", CURSOR_USAGE_URL, &token, "{}", true)
}

/// Access token from the go-keyring blob the Antigravity CLI stores.
fn antigravity_access_token(secret: &str) -> Option<String> {
    let encoded = secret.strip_prefix(GO_KEYRING_PREFIX).unwrap_or(secret);
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(encoded.trim())
        .ok()?;
    let value: Value = serde_json::from_slice(&decoded).ok()?;
    let token = value
        .get("token")
        .and_then(|token| token.get("access_token"))
        .and_then(Value::as_str)?
        .trim();
    (!token.is_empty()).then(|| token.to_string())
}

fn antigravity_project_id() -> Option<String> {
    let path =
        PathBuf::from(dirs_home()?).join(".gemini/antigravity-cli/cache/default_project_id.txt");
    let id = std::fs::read_to_string(path).ok()?;
    let id = id.trim();
    (!id.is_empty()).then(|| id.to_string())
}

fn antigravity_body(project: Option<&str>) -> String {
    match project {
        Some(project) => serde_json::json!({ "project": project }).to_string(),
        None => "{}".into(),
    }
}

fn fetch_antigravity_usage_sync() -> UsageFetch {
    if !cfg!(target_os = "macos") {
        return unavailable("Antigravity usage is only read on macOS");
    }
    let Some(secret) = keychain_secret("gemini", "antigravity") else {
        return unavailable("Antigravity CLI not signed in");
    };
    let Some(token) = antigravity_access_token(&secret) else {
        return unavailable("Antigravity credentials are in an unknown format");
    };
    let result = post_json(
        "Antigravity",
        ANTIGRAVITY_MODELS_URL,
        &token,
        &antigravity_body(antigravity_project_id().as_deref()),
        false,
    );
    // MOLFAR never refreshes another CLI's OAuth token; agy renews it on use.
    if result.http_status == Some(401) {
        return fetch_result(
            "unavailable",
            Some(401),
            None,
            Some("Antigravity session expired. Run agy once to refresh it".into()),
        );
    }
    result
}

#[tauri::command]
pub async fn usage_cursor_limits() -> Result<UsageFetch, String> {
    tauri::async_runtime::spawn_blocking(fetch_cursor_usage_sync)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn usage_antigravity_limits() -> Result<UsageFetch, String> {
    tauri::async_runtime::spawn_blocking(fetch_antigravity_usage_sync)
        .await
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn keyring_blob(json: &str) -> String {
        format!(
            "{GO_KEYRING_PREFIX}{}",
            base64::engine::general_purpose::STANDARD.encode(json)
        )
    }

    #[test]
    fn reads_the_antigravity_access_token_from_go_keyring() {
        let blob = keyring_blob(
            r#"{"token":{"access_token":"ya29.abc","refresh_token":"r"},"auth_method":"consumer"}"#,
        );
        assert_eq!(antigravity_access_token(&blob).as_deref(), Some("ya29.abc"));
    }

    #[test]
    fn rejects_malformed_or_empty_antigravity_tokens() {
        assert_eq!(antigravity_access_token("go-keyring-base64:!!!"), None);
        assert_eq!(
            antigravity_access_token(&keyring_blob(r#"{"token":{"access_token":" "}}"#)),
            None
        );
        assert_eq!(
            antigravity_access_token(&keyring_blob(r#"{"other":1}"#)),
            None
        );
    }

    #[test]
    fn antigravity_body_carries_the_project_when_known() {
        assert_eq!(antigravity_body(Some("proj-1")), r#"{"project":"proj-1"}"#);
        assert_eq!(antigravity_body(None), "{}");
    }

    #[test]
    fn http_errors_name_the_provider_without_a_body() {
        let fetch = http_error("Cursor", 401);
        assert_eq!(fetch.status, "error");
        assert_eq!(fetch.body, None);
        assert_eq!(fetch.error.as_deref(), Some("Cursor sign-in expired"));
        assert_eq!(
            http_error("Cursor", 500).error.as_deref(),
            Some("Cursor usage request failed (500)")
        );
    }
}
