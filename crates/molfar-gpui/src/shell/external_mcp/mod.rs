//! Runs external MCP calls inside MOLFAR: grants decide reach, MOLFAR keeps
//! models, runtime approvals and Board stages. Mutations persist a receipt
//! before dispatch so retries never repeat accepted work.
mod audit;
mod board_dispatch;
mod call;
mod clients;
mod dispatch;
mod domains;
mod lifecycle;
#[cfg(test)]
mod reach_tests;
#[cfg(test)]
mod recovery_tests;
mod sessions;
mod targets;
#[cfg(test)]
mod tests;

use super::*;
use molfar_core::{
    app_access::board as board_api,
    external_mcp::{
        grants::types::ACCESS,
        receipts::{self, BEGIN, ReceiptTarget},
        tools,
        transport::Call,
        types::{AuditEntry, Principal},
    },
};
use serde_json::{Value, json};

#[derive(Default)]
pub(super) struct External {
    server: Option<molfar_core::external_mcp::transport::Server>,
    error: Option<String>,
    pending: HashSet<String>,
    /// The credential shown once after creation, as (client name, token).
    new_key: Option<(String, String)>,
}

const OUTCOME_UNKNOWN: &str = "Outcome unknown: MOLFAR stopped while handling this request. Check the target before trying again with a new requestId.";

type Reply = molfar_core::external_mcp::transport::Reply;

#[derive(Clone)]
struct Receipt {
    request: String,
    digest: String,
    target: ReceiptTarget,
    resumed: bool,
}

impl Receipt {
    fn pending_key(&self, scope: &Scope, tool: &str) -> String {
        receipts::key_for(
            &self.target,
            &scope.principal.client_id,
            tool,
            &self.request,
        )
    }
}
type Done = async_channel::Sender<Result<Value, String>>;

/// Sessions and cards an external client may reach this call.
struct Scope {
    principal: Principal,
    projects: Vec<String>,
}

impl Scope {
    fn project(&self, requested: &str) -> Result<String, String> {
        self.projects
            .iter()
            .find(|project| {
                molfar_core::files::path_key(project) == molfar_core::files::path_key(requested)
            })
            .cloned()
            .ok_or_else(|| "Project not found.".into())
    }

    fn owner(&self) -> String {
        format!("external:{}", self.principal.client_id)
    }
}

impl Shell {
    /// Current grants intersected with registered local projects, so a removed
    /// project stops being reachable even if a grant still names it.
    fn external_scope(&self, principal: Principal) -> Scope {
        let projects = self
            .workspace
            .projects
            .iter()
            .filter(|project| molfar_core::remote::parse_remote_path(project).is_none())
            .filter(|project| {
                principal.projects.iter().any(|granted| {
                    molfar_core::files::path_key(granted) == molfar_core::files::path_key(project)
                })
            })
            .cloned()
            .collect();
        Scope {
            principal,
            projects,
        }
    }
}
