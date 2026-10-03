use std::time::Duration;

pub(super) const HTTP_TIMEOUT: Duration = Duration::from_secs(20);
pub(super) const DEFAULT_LIMIT: u32 = 50;
pub(super) const SEARCH_LIMIT: u32 = 25;
pub(super) const BODY_CHAR_CAP: usize = 120_000;
