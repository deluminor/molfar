use std::{sync::Arc, time::Duration};

use base64::Engine as _;
use serde_json::Value;

use super::{Credentials, Error};

const TIMEOUT: Duration = Duration::from_secs(20);
const RATE_LIMIT_RETRIES: usize = 3;
const BACKOFF_CAP_SECONDS: u64 = 8;

pub struct Exchange {
    pub status: u16,
    pub retry_after: Option<u64>,
    pub body: Vec<u8>,
    pub location: Option<String>,
    pub content_length: Option<u64>,
}

pub trait Transport: Send + Sync {
    fn exchange(
        &self,
        method: &str,
        url: &str,
        authorization: &str,
        body: Option<&str>,
    ) -> Result<Exchange, Error>;
}

pub struct Client {
    transport: Arc<dyn Transport>,
    site: String,
    authorization: String,
}

impl Client {
    pub fn new(credentials: &Credentials) -> Self {
        Self::with_transport(credentials, Arc::new(LiveTransport::new()))
    }

    pub fn with_transport(credentials: &Credentials, transport: Arc<dyn Transport>) -> Self {
        let authorization = format!(
            "Basic {}",
            base64::engine::general_purpose::STANDARD.encode(credentials.authorization())
        );
        Self {
            transport,
            site: credentials.site().to_owned(),
            authorization,
        }
    }

    pub fn site(&self) -> &str {
        &self.site
    }

    pub fn get(&self, path: &str) -> Result<Value, Error> {
        self.json("GET", path, None)
    }

    pub fn post(&self, path: &str, body: &Value) -> Result<Value, Error> {
        self.json("POST", path, Some(body))
    }

    pub fn put(&self, path: &str, body: &Value) -> Result<Value, Error> {
        self.json("PUT", path, Some(body))
    }

    pub fn bytes(&self, path: &str) -> Result<Option<Vec<u8>>, Error> {
        if !path.starts_with('/') || path.starts_with("//") || path.contains('\\') {
            return Err(Error::Invalid("Invalid Atlassian API path".into()));
        }
        let url = format!("{}{path}", self.site);
        let exchange = self
            .transport
            .exchange("GET", &url, &self.authorization, None)?;
        let exchange = if matches!(exchange.status, 301 | 302 | 303 | 307 | 308) {
            let location = exchange
                .location
                .filter(|location| location.starts_with("https://"))
                .ok_or_else(|| Error::http(exchange.status))?;
            self.transport.exchange("GET", &location, "", None)?
        } else {
            exchange
        };
        if !(200..300).contains(&exchange.status) {
            return Err(Error::http(exchange.status));
        }
        const MEDIA_LIMIT: u64 = 20 * 1024 * 1024;
        if exchange
            .content_length
            .is_some_and(|length| length > MEDIA_LIMIT)
            || exchange.body.len() as u64 > MEDIA_LIMIT
        {
            return Ok(None);
        }
        Ok(Some(exchange.body))
    }

    fn json(&self, method: &str, path: &str, body: Option<&Value>) -> Result<Value, Error> {
        let payload = body.map(Value::to_string);
        let exchange = self.request(method, path, payload.as_deref())?;
        if exchange.status == 204 || exchange.body.is_empty() {
            return Ok(Value::Null);
        }
        serde_json::from_slice(&exchange.body)
            .map_err(|_| Error::Offline("Atlassian returned unreadable JSON".into()))
    }

    fn request(&self, method: &str, path: &str, payload: Option<&str>) -> Result<Exchange, Error> {
        if !path.starts_with('/') || path.starts_with("//") || path.contains('\\') {
            return Err(Error::Invalid("Invalid Atlassian API path".into()));
        }
        let url = format!("{}{path}", self.site);
        for attempt in 0..=RATE_LIMIT_RETRIES {
            match self
                .transport
                .exchange(method, &url, &self.authorization, payload)?
            {
                exchange if (200..300).contains(&exchange.status) => return Ok(exchange),
                exchange if exchange.status == 429 && attempt < RATE_LIMIT_RETRIES => {
                    let delay = exchange.retry_after.unwrap_or(1).min(BACKOFF_CAP_SECONDS);
                    std::thread::sleep(Duration::from_secs(delay));
                }
                exchange => return Err(Error::http(exchange.status)),
            }
        }
        Err(Error::RateLimited)
    }
}

struct LiveTransport {
    agent: ureq::Agent,
}

impl LiveTransport {
    fn new() -> Self {
        Self {
            agent: ureq::AgentBuilder::new()
                .timeout(TIMEOUT)
                .redirects(0)
                .build(),
        }
    }
}

impl Transport for LiveTransport {
    fn exchange(
        &self,
        method: &str,
        url: &str,
        authorization: &str,
        body: Option<&str>,
    ) -> Result<Exchange, Error> {
        let mut request = self
            .agent
            .request(method, url)
            .set("Accept", "application/json");
        if !authorization.is_empty() {
            request = request.set("Authorization", authorization);
        }
        let result = match body {
            Some(payload) => request
                .set("Content-Type", "application/json")
                .send_string(payload),
            None => request.call(),
        };
        match result {
            Ok(response) => read_response(response),
            Err(ureq::Error::Status(_, response)) => read_response(response),
            Err(_) => Err(Error::Offline("Could not reach Atlassian".into())),
        }
    }
}

fn read_response(response: ureq::Response) -> Result<Exchange, Error> {
    let status = response.status();
    let retry_after = response
        .header("Retry-After")
        .and_then(|value| value.parse().ok());
    let location = response.header("Location").map(str::to_owned);
    let content_length = response
        .header("Content-Length")
        .and_then(|value| value.parse().ok());
    const MEDIA_LIMIT: u64 = 20 * 1024 * 1024;
    let body = if content_length.is_some_and(|length| length > MEDIA_LIMIT) {
        Vec::new()
    } else {
        let mut body = Vec::new();
        let _ = std::io::Read::read_to_end(&mut response.into_reader(), &mut body);
        body
    };
    Ok(Exchange {
        status,
        retry_after,
        body,
        location,
        content_length,
    })
}
