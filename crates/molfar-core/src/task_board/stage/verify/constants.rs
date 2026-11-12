use std::time::Duration;

pub const TIMEOUT: Duration = Duration::from_secs(30 * 60);
pub(crate) const TAIL_LINES: usize = 200;
pub(crate) const TAIL_BYTES: usize = 16_000;
pub(crate) const MAX_COMMAND: usize = 2_000;
pub(super) const POLL: Duration = Duration::from_millis(200);
