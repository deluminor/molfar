#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Error {
    Invalid(String),
    Unauthorized,
    Forbidden,
    NotFound,
    Offline(String),
    RateLimited,
}

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Invalid(message) => write!(f, "invalid: {message}"),
            Self::Unauthorized => {
                f.write_str("unauthorized: Check your Atlassian email and API token")
            }
            Self::Forbidden => f.write_str("forbidden: Atlassian denied access"),
            Self::NotFound => f.write_str("not_found: Atlassian resource unavailable"),
            Self::Offline(message) => write!(f, "offline: {message}"),
            Self::RateLimited => f.write_str("rate_limited: Try again later"),
        }
    }
}

impl std::error::Error for Error {}

impl Error {
    pub(super) fn http(status: u16) -> Self {
        match status {
            400 => Self::Invalid("Atlassian rejected the request".into()),
            401 => Self::Unauthorized,
            403 => Self::Forbidden,
            404 => Self::NotFound,
            429 => Self::RateLimited,
            _ => Self::Offline(format!("Atlassian returned HTTP {status}")),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn http_errors_are_typed() {
        assert_eq!(Error::http(401), Error::Unauthorized);
        assert_eq!(Error::http(403), Error::Forbidden);
        assert_eq!(Error::http(404), Error::NotFound);
        assert_eq!(Error::http(429), Error::RateLimited);
        assert!(matches!(Error::http(400), Error::Invalid(_)));
        assert!(matches!(Error::http(500), Error::Offline(_)));
    }
}
