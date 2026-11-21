use std::time::Duration;

use base64::Engine as _;
use serde_json::Value;

use super::{Credentials, Error};

const TIMEOUT: Duration = Duration::from_secs(20);
const RATE_LIMIT_RETRIES: usize = 3;
const BACKOFF_CAP_SECONDS: u64 = 8;

pub struct Client {
    agent: ureq::Agent,
    site: String,
    authorization: String,
}

impl Client {
    pub fn new(credentials: &Credentials) -> Self {
        let agent = ureq::AgentBuilder::new()
            .timeout(TIMEOUT)
            .redirects(0)
            .build();
        let authorization = credentials.authorization();
        Self {
            agent,
            site: credentials.site().to_owned(),
            authorization: format!(
                "Basic {}",
                base64::engine::general_purpose::STANDARD.encode(authorization)
            ),
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

    fn json(&self, method: &str, path: &str, body: Option<&Value>) -> Result<Value, Error> {
        let payload = body.map(Value::to_string);
        let response = self.request(method, path, payload.as_deref())?;
        if response.status() == 204 {
            return Ok(Value::Null);
        }
        serde_json::from_reader(response.into_reader())
            .map_err(|_| Error::Offline("Atlassian returned unreadable JSON".into()))
    }

    pub(super) fn request(
        &self,
        method: &str,
        path: &str,
        payload: Option<&str>,
    ) -> Result<ureq::Response, Error> {
        if !path.starts_with('/') || path.starts_with("//") || path.contains('\\') {
            return Err(Error::Invalid("Invalid Atlassian API path".into()));
        }

        let url = format!("{}{path}", self.site);
        for attempt in 0..=RATE_LIMIT_RETRIES {
            let request = self
                .agent
                .request(method, &url)
                .set("Authorization", &self.authorization)
                .set("Accept", "application/json");
            let result = match payload {
                Some(payload) => request
                    .set("Content-Type", "application/json")
                    .send_string(payload),
                None => request.call(),
            };
            match result {
                Ok(response) if (200..300).contains(&response.status()) => return Ok(response),
                Err(ureq::Error::Status(429, response)) if attempt < RATE_LIMIT_RETRIES => {
                    let delay = response
                        .header("Retry-After")
                        .and_then(|value| value.parse::<u64>().ok())
                        .unwrap_or(1)
                        .min(BACKOFF_CAP_SECONDS);
                    std::thread::sleep(Duration::from_secs(delay));
                }
                Ok(response) | Err(ureq::Error::Status(_, response)) => {
                    return Err(Error::http(response.status()));
                }
                Err(_) => return Err(Error::Offline("Could not reach Atlassian".into())),
            }
        }
        Err(Error::RateLimited)
    }
}
