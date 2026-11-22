use super::*;
use std::cell::RefCell;
use std::collections::VecDeque;

struct Stub {
    states: RefCell<VecDeque<Result<Response, ConfluenceError>>>,
    waits: RefCell<Vec<Duration>>,
}

impl Transport for Stub {
    fn get(&self, _: &Url, _: Option<&SecretString>) -> Result<Response, ConfluenceError> {
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
fn confluence_media_redirect_requires_an_attachment_request_to_the_exact_https_host() {
    let download = "/wiki/download/attachments/1/image.png";
    for location in [
        "https://other.invalid/file",
        "https://api.media.atlassian.com.other.invalid/file",
        "https://user@api.media.atlassian.com/file",
        "http://api.media.atlassian.com/file",
        "https://api.media.atlassian.com:8443/file",
    ] {
        let mut redirect = response(302);
        redirect.location = Some(location.into());
        assert_eq!(
            client([Ok(redirect)]).request_attachment(download).err(),
            Some(ConfluenceError::UnsafeRedirect)
        );
    }

    let media_url = "https://api.media.atlassian.com/file";
    let mut redirect = response(302);
    redirect.location = Some(media_url.into());
    assert_eq!(
        client([Ok(redirect)]).request("/wiki").err(),
        Some(ConfluenceError::UnsafeRedirect)
    );
    for path in [media_url, "/wiki", "/wiki/download/attachments/../../wiki"] {
        assert_eq!(
            client([]).request_attachment(path).err(),
            Some(ConfluenceError::UnsafeRedirect)
        );
    }
}

#[test]
fn confluence_attachment_redirects_stop_at_the_existing_limit() {
    let redirects = (0..=MAX_REDIRECTS).map(|_| {
        let mut redirect = response(302);
        redirect.location = Some("https://api.media.atlassian.com/file".into());
        Ok(redirect)
    });
    assert_eq!(
        client(redirects)
            .request_attachment("/wiki/download/attachments/1/image.png")
            .err(),
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
