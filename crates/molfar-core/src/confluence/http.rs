use std::{io::Read, time::Duration};

use secrecy::SecretString;
use serde::de::DeserializeOwned;
use url::Url;

use super::error::ConfluenceError;

const MAX_REDIRECTS: usize = 5;
const MAX_RESPONSE_BYTES: u64 = 32 * 1024 * 1024;
const ATTACHMENT_PATH: &str = "/wiki/download/attachments/";
// Atlassian Support documents this as the Confluence Cloud binary redirect target.
const MEDIA_HOST: &str = "api.media.atlassian.com";
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
    fn get(
        &self,
        url: &Url,
        authorization: Option<&SecretString>,
    ) -> Result<Response, ConfluenceError>;

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
    fn get(
        &self,
        url: &Url,
        authorization: Option<&SecretString>,
    ) -> Result<Response, ConfluenceError> {
        use secrecy::ExposeSecret;
        let mut request = self
            .agent
            .get(url.as_str())
            .set("Accept", "application/json, image/*, */*;q=0.1");
        if let Some(authorization) = authorization {
            request = request.set("Authorization", authorization.expose_secret());
        }
        let result = request.call();
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
        self.request_with_redirects(path, false)
    }

    pub(super) fn request_attachment(&self, path: &str) -> Result<Response, ConfluenceError> {
        self.request_with_redirects(path, true)
    }

    fn request_with_redirects(
        &self,
        path: &str,
        attachment: bool,
    ) -> Result<Response, ConfluenceError> {
        let mut url = self
            .site
            .join(path)
            .map_err(|_| ConfluenceError::InvalidResponse)?;
        let site_origin = self.site.origin();
        if attachment && (url.origin() != site_origin || !url.path().starts_with(ATTACHMENT_PATH)) {
            return Err(ConfluenceError::UnsafeRedirect);
        }

        let mut redirects = 0;
        let mut retries = BACKOFF.into_iter();
        loop {
            let same_origin = url.origin() == site_origin;
            let media_redirect = attachment
                && redirects > 0
                && url.host_str() == Some(MEDIA_HOST)
                && url.port().is_none();
            if url.scheme() != "https"
                || !(same_origin || media_redirect)
                || !url.username().is_empty()
                || url.password().is_some()
            {
                return Err(ConfluenceError::UnsafeRedirect);
            }

            let response = self
                .transport
                .get(&url, same_origin.then_some(&self.authorization))?;
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
mod tests;
