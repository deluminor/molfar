use std::fmt;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ConfluenceError {
    Unauthorized,
    Forbidden,
    NotFound,
    Offline,
    RateLimited(u64),
    InvalidResponse,
    UnsafeRedirect,
}

impl ConfluenceError {
    pub fn kind(self) -> &'static str {
        match self {
            Self::Unauthorized => "unauthorized",
            Self::Forbidden => "forbidden",
            Self::NotFound => "not_found",
            Self::Offline => "offline",
            Self::RateLimited(_) => "rate_limited",
            Self::InvalidResponse => "invalid_response",
            Self::UnsafeRedirect => "unsafe_redirect",
        }
    }
}

impl fmt::Display for ConfluenceError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let sentence = match self {
            Self::Unauthorized => "Confluence email or API token was rejected.",
            Self::Forbidden => "You don't have access to this Confluence content.",
            Self::NotFound => "This Confluence page is gone.",
            Self::Offline => "Confluence is unreachable. Cached pages still open.",
            Self::RateLimited(seconds) => {
                return write!(
                    f,
                    "Confluence is rate limiting requests. Try again in {seconds} seconds."
                );
            }
            Self::InvalidResponse => "Confluence returned an unexpected response.",
            Self::UnsafeRedirect => "Confluence redirected outside the configured site.",
        };
        f.write_str(sentence)
    }
}

impl std::error::Error for ConfluenceError {}
