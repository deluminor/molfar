use std::time::Duration;

pub const DEFAULT_PORT: u16 = 47_821;
pub const MAX_BODY_BYTES: usize = 1024 * 1024;
pub const MAX_QUEUED: usize = 32;
pub const MAX_ACTIVE: usize = 8;
pub const DISPATCH_DEADLINE: Duration = Duration::from_secs(30);
pub const MAX_CLIENTS: usize = 32;
pub const MAX_CLIENT_NAME: usize = 40;
pub const MAX_AUDIT_ENTRIES: usize = 200;
pub const TOKEN_PREFIX: &str = "mfx";

pub(crate) const CONFIG_KEY: &str = "external-mcp:server";
pub(crate) const CLIENTS_KEY: &str = "external-mcp:clients";
pub(crate) const AUDIT_KEY: &str = "external-mcp:audit";
pub(crate) const RECEIPT_PREFIX: &str = "external-mcp-receipt";
