use std::time::Duration;

const TIMEOUT: Duration = Duration::from_secs(20);
const USER_AGENT: &str = "MOLFAR";

#[derive(Clone, Copy)]
pub(crate) enum Redirects {
    Follow,
    /// The token header must not reach whatever host a redirect names.
    Refuse,
}

/// Agent for tracker integrations (Jira, Confluence, Linear, GitLab, Azure DevOps).
pub(crate) fn agent(redirects: Redirects) -> ureq::Agent {
    let builder = ureq::AgentBuilder::new()
        .timeout(TIMEOUT)
        .user_agent(USER_AGENT);
    match redirects {
        Redirects::Follow => builder.build(),
        Redirects::Refuse => builder.redirects(0).build(),
    }
}

#[derive(Debug, PartialEq)]
pub(crate) enum HttpFailure {
    /// The server answered with an error status; `body` is empty when unreadable.
    Status {
        status: u16,
        body: String,
    },
    Unreachable,
}

/// Splits ureq's result into the response or a failure the caller maps to its own wording.
pub(crate) fn response(
    result: Result<ureq::Response, ureq::Error>,
) -> Result<ureq::Response, HttpFailure> {
    match result {
        Ok(response) => Ok(response),
        Err(ureq::Error::Status(status, response)) => Err(HttpFailure::Status {
            status,
            body: response.into_string().unwrap_or_default(),
        }),
        Err(ureq::Error::Transport(_)) => Err(HttpFailure::Unreachable),
    }
}

/// Status and text body of a received response.
pub(crate) fn text(response: ureq::Response, service: &str) -> Result<(u16, String), String> {
    let status = response.status();
    let body = response
        .into_string()
        .map_err(|_| format!("{service} returned an unreadable response"))?;
    Ok((status, body))
}

pub(crate) fn is_success(status: u16) -> bool {
    (200..300).contains(&status)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_errors_keep_their_body() {
        let response = ureq::Response::new(404, "Not Found", r#"{"message":"gone"}"#).unwrap();
        let failure = super::response(Err(ureq::Error::Status(404, response))).unwrap_err();
        assert_eq!(
            failure,
            HttpFailure::Status {
                status: 404,
                body: r#"{"message":"gone"}"#.into()
            }
        );
    }

    #[test]
    fn success_responses_pass_through() {
        let response = ureq::Response::new(200, "OK", "{}").unwrap();
        let response = super::response(Ok(response)).unwrap();
        assert_eq!(text(response, "Jira").unwrap(), (200, "{}".into()));
    }

    #[test]
    fn only_2xx_is_success() {
        assert!(is_success(200));
        assert!(is_success(204));
        assert!(!is_success(302));
        assert!(!is_success(404));
    }
}
