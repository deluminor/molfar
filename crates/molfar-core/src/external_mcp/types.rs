use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Deserialize, Eq, Hash, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SCOPE {
    Read,
    Submit,
    Stop,
}

impl SCOPE {
    pub const ALL: [SCOPE; 3] = [SCOPE::Read, SCOPE::Submit, SCOPE::Stop];

    pub fn label(self) -> &'static str {
        match self {
            SCOPE::Read => "read",
            SCOPE::Submit => "submit",
            SCOPE::Stop => "stop",
        }
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerConfig {
    pub enabled: bool,
    pub port: u16,
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            port: super::constants::DEFAULT_PORT,
        }
    }
}

/// Stored grant. `verifier` is a SHA-256 of the credential; the credential
/// itself is shown once and never persisted.
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Client {
    pub id: String,
    pub name: String,
    pub verifier: String,
    pub scopes: Vec<SCOPE>,
    pub projects: Vec<String>,
    pub created_at: i64,
    pub revoked_at: Option<i64>,
}

/// The authenticated caller of one HTTP request, rebuilt on every request.
#[derive(Clone, Debug, PartialEq)]
pub struct Principal {
    pub client_id: String,
    pub name: String,
    pub scopes: Vec<SCOPE>,
    pub projects: Vec<String>,
}

impl Principal {
    pub fn allows(&self, scope: SCOPE) -> bool {
        self.scopes.contains(&scope)
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditEntry {
    pub at: i64,
    pub client_id: String,
    pub action: String,
    pub target: Option<String>,
    pub request_id: Option<String>,
    pub outcome: String,
}
