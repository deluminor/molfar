use std::{io::Read, time::Duration};

use secrecy::SecretString;
use serde::de::DeserializeOwned;
use url::Url;

use super::error::ConfluenceError;

const MAX_REDIRECTS: usize = 5;
const MAX_RESPONSE_BYTES: u64 = 32 * 1024 * 1024;
const BACKOFF: [Duration; 3] = [
    Duration::from_millis(500),
    Duration::from_secs(1),
    Duration::from_secs(2),
];

pub struct Response {
    pub status: u16,
    pub location: Option<String>,
    pub retry_after: Option<String>,
    pub link: Option<String>,
    pub bytes: Vec<u8>,
}

pub trait Transport {
    fn get(&self, url: &Url, authorization: &SecretString) -> Result<Response, ConfluenceError>;

    fn wait(&self, delay: Duration) {
        std::thread::sleep(delay);
    }
}

pub struct Http {
    agent: ureq::Agent,
}

impl Default for Http {
    fn default() -> Self {
        Self {
            agent: ureq::AgentBuilder::new()
                .redirects(0)
                .timeout(Duration::from_secs(20))
                .build(),
        }
    }
}

impl Transport for Http {
    fn get(&self, url: &Url, authorization: &SecretString) -> Result<Response, ConfluenceError> {
        use secrecy::ExposeSecret;
        let result = self
            .agent
            .get(url.as_str())
            .set("Authorization", authorization.expose_secret())
            .set("Accept", "application/json, image/*, */*;q=0.1")
            .call();
        let response = match result {
            Ok(response) | Err(ureq::Error::Status(_, response)) => response,
            Err(ureq::Error::Transport(_)) => return Err(ConfluenceError::Offline),
        };
        let mut result = Response {
            status: response.status(),
            location: response.header("Location").map(str::to_owned),
            retry_after: response.header("Retry-After").map(str::to_owned),
            link: response.header("Link").map(str::to_owned),
            bytes: Vec::new(),
        };

        if (200..300).contains(&result.status) {
            response
                .into_reader()
                .take(MAX_RESPONSE_BYTES + 1)
                .read_to_end(&mut result.bytes)
                .map_err(|_| ConfluenceError::Offline)?;
            if result.bytes.len() as u64 > MAX_RESPONSE_BYTES {
                return Err(ConfluenceError::InvalidResponse);
            }
        }

        Ok(result)
    }
}

pub struct Client<T = Http> {
    pub site: Url,
    authorization: SecretString,
    transport: T,
}

impl<T: Transport> Client<T> {
    pub fn new(site: Url, authorization: SecretString, transport: T) -> Self {
        Self {
            site,
            authorization,
            transport,
        }
    }

    pub fn request(&self, path: &str) -> Result<Response, ConfluenceError> {
        let mut url = self
            .site
            .join(path)
            .map_err(|_| ConfluenceError::InvalidResponse)?;
        let mut redirects = 0;
        let mut retries = BACKOFF.into_iter();
        loop {
            if url.scheme() != "https"
                || url.origin() != self.site.origin()
                || !url.username().is_empty()
                || url.password().is_some()
            {
                return Err(ConfluenceError::UnsafeRedirect);
            }

            let response = self.transport.get(&url, &self.authorization)?;
            match response.status {
                200..=299 => return Ok(response),
                301 | 302 | 303 | 307 | 308 if redirects < MAX_REDIRECTS => {
                    let location = response.location.ok_or(ConfluenceError::UnsafeRedirect)?;
                    url = url
                        .join(&location)
                        .map_err(|_| ConfluenceError::UnsafeRedirect)?;
                    redirects += 1;
                }
                300..=399 => return Err(ConfluenceError::UnsafeRedirect),
                401 => return Err(ConfluenceError::Unauthorized),
                403 => return Err(ConfluenceError::Forbidden),
                404 => return Err(ConfluenceError::NotFound),
                429 => {
                    let retry_after = response.retry_after.as_deref().and_then(retry_delay);
                    let Some(delay) = retries.next() else {
                        let delay = retry_after.unwrap_or(BACKOFF[BACKOFF.len() - 1]);
                        return Err(ConfluenceError::RateLimited(delay.as_secs()));
                    };
                    self.transport.wait(retry_after.unwrap_or(delay));
                }
                500..=599 => return Err(ConfluenceError::Offline),
                _ => return Err(ConfluenceError::InvalidResponse),
            }
        }
    }

    pub fn json<R: DeserializeOwned>(&self, path: &str) -> Result<R, ConfluenceError> {
        let response = self.request(path)?;
        serde_json::from_slice(&response.bytes).map_err(|_| ConfluenceError::InvalidResponse)
    }
}

fn retry_delay(value: &str) -> Option<Duration> {
    let seconds = value.parse::<u64>().ok().or_else(|| {
        let until = chrono::DateTime::parse_from_rfc2822(value).ok()?;
        let seconds = (until.to_utc() - chrono::Utc::now()).num_seconds();
        Some(seconds.max(0) as u64)
    })?;
    Some(Duration::from_secs(seconds.min(30)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::collections::VecDeque;

    struct Stub {
        states: RefCell<VecDeque<Result<Response, ConfluenceError>>>,
        waits: RefCell<Vec<Duration>>,
    }

    impl Transport for Stub {
        fn get(&self, _: &Url, _: &SecretString) -> Result<Response, ConfluenceError> {
            self.states
                .borrow_mut()
                .pop_front()
                .expect("one call per fixture")
        }

        fn wait(&self, delay: Duration) {
            self.waits.borrow_mut().push(delay);
        }
    }

    fn response(status: u16) -> Response {
        Response {
            status,
            location: None,
            retry_after: None,
            link: None,
            bytes: Vec::new(),
        }
    }

    fn client(states: impl IntoIterator<Item = Result<Response, ConfluenceError>>) -> Client<Stub> {
        Client::new(
            Url::parse("https://fixture.atlassian.net").unwrap(),
            "fixture-auth".into(),
            Stub {
                states: RefCell::new(states.into_iter().collect()),
                waits: RefCell::default(),
            },
        )
    }

    #[test]
    fn confluence_typed_errors_do_not_retry_auth_or_missing() {
        for (status, error) in [
            (401, ConfluenceError::Unauthorized),
            (403, ConfluenceError::Forbidden),
            (404, ConfluenceError::NotFound),
        ] {
            assert_eq!(
                client([Ok(response(status))]).request("/wiki").err(),
                Some(error)
            );
            assert!(!error.to_string().contains("fixture-auth"));
        }
        assert_eq!(
            client([Err(ConfluenceError::Offline)])
                .request("/wiki")
                .err(),
            Some(ConfluenceError::Offline)
        );
    }

    #[test]
    fn confluence_cross_origin_redirect_stops_before_auth_is_sent() {
        let mut redirect = response(302);
        redirect.location = Some("https://other.invalid/wiki".into());
        assert_eq!(
            client([Ok(redirect)]).request("/wiki").err(),
            Some(ConfluenceError::UnsafeRedirect)
        );
    }

    #[test]
    fn confluence_rate_limits_retry_three_times_with_bounded_wait() {
        let mut initial = response(429);
        initial.retry_after = Some("60".into());
        let client = client([
            Ok(initial),
            Ok(response(429)),
            Ok(response(429)),
            Ok(response(429)),
        ]);
        assert_eq!(
            client.request("/wiki").err(),
            Some(ConfluenceError::RateLimited(2))
        );
        assert_eq!(
            client.transport.waits.into_inner(),
            [Duration::from_secs(30), BACKOFF[1], BACKOFF[2]]
        );
    }
}
