use base64::Engine as _;
use serde_json::Value;

use crate::http_client::{self, HttpFailure, Redirects};

use super::types::{AtlassianConfig, HttpError};

pub(super) fn authorization(config: &AtlassianConfig) -> String {
    let encoded = base64::engine::general_purpose::STANDARD.encode(format!(
        "{}:{}",
        config.email.trim(),
        config.token.trim()
    ));
    format!("Basic {encoded}")
}

pub(super) fn confluence_get(config: &AtlassianConfig, path: &str) -> Result<Value, String> {
    confluence_get_checked(config, path).map_err(|error| error.message)
}

pub(super) fn confluence_get_checked(
    config: &AtlassianConfig,
    path: &str,
) -> Result<Value, HttpError> {
    let url = format!("{}{path}", config.site.trim_end_matches('/'));

    let result = http_client::agent(Redirects::Follow)
        .get(&url)
        .set("Authorization", &authorization(config))
        .set("Accept", "application/json")
        .call();

    read_response(result)
}

pub(super) fn read_response(
    result: Result<ureq::Response, ureq::Error>,
) -> Result<Value, HttpError> {
    let response = match http_client::response(result) {
        Ok(response) => response,
        Err(HttpFailure::Status { status: 401, .. }) => {
            return Err(HttpError {
                status: Some(401),
                message: "Jira/Confluence email or API token is invalid".into(),
            });
        }
        Err(HttpFailure::Status { status, body }) => {
            return Err(HttpError {
                status: Some(status),
                message: http_error(status, &body),
            });
        }
        Err(HttpFailure::Unreachable) => {
            return Err(HttpError {
                status: None,
                message: "Could not reach Confluence".into(),
            });
        }
    };

    let status = response.status();
    let body = response.into_string().map_err(|_| HttpError {
        status: Some(status),
        message: "Confluence returned an unreadable response".into(),
    })?;

    if !http_client::is_success(status) {
        return Err(HttpError {
            status: Some(status),
            message: http_error(status, &body),
        });
    }

    serde_json::from_str(&body).map_err(|_| HttpError {
        status: Some(status),
        message: "Confluence returned invalid JSON".into(),
    })
}

pub(super) fn http_error(status: u16, body: &str) -> String {
    if let Some(message) = error_message(body) {
        return message;
    }
    match status {
        403 => "Confluence denied access. Check that this API token can use Confluence".into(),
        404 => "Confluence could not find that page".into(),
        _ => format!("Confluence request failed ({status})"),
    }
}

pub(super) fn error_message(body: &str) -> Option<String> {
    let parsed: Value = serde_json::from_str(body).ok()?;
    parsed
        .get("message")
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| {
            parsed
                .pointer("/errors/0/title")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
}
