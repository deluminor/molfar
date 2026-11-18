use serde::{Deserialize, Serialize};

use super::grants::types::{Requirement, ResourceGrant, ACCESS, GRANT};

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
    pub grants: Vec<GRANT>,
    #[serde(default)]
    pub resources: Vec<ResourceGrant>,
    pub projects: Vec<String>,
    pub created_at: i64,
    pub revoked_at: Option<i64>,
}

/// The authenticated caller of one HTTP request, rebuilt on every request.
#[derive(Clone, Debug, PartialEq)]
pub struct Principal {
    pub client_id: String,
    pub name: String,
    pub grants: Vec<GRANT>,
    pub resources: Vec<ResourceGrant>,
    pub projects: Vec<String>,
}

impl Principal {
    pub fn allows(&self, requirement: &Requirement) -> bool {
        let flag = match requirement.access {
            ACCESS::Standard => true,
            ACCESS::Destructive => self.grants.contains(&GRANT::Destructive),
            ACCESS::Delegated => self.grants.contains(&GRANT::Delegated),
        };

        flag && requirement
            .any
            .iter()
            .any(|grant| self.grants.contains(grant))
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
    #[serde(default)]
    pub kind: ACCESS,
}
