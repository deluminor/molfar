//! Runs external MCP calls inside MOLFAR: grants decide reach, MOLFAR keeps
//! models, runtime approvals and Board stages. Mutations persist a receipt
//! before dispatch so retries never repeat accepted work.
mod audit;
mod board_dispatch;
mod clients;
mod dispatch;
mod lifecycle;
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
        receipts::{self, BEGIN},
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
    pending: HashSet<(String, String, String, String)>,
    /// The credential shown once after creation, as (client name, token).
    new_key: Option<(String, String)>,
}

type Reply = molfar_core::external_mcp::transport::Reply;

/// A mutation's durable identity: principal, canonical project, action and request ID.
#[derive(Clone)]
struct Receipt {
    request: String,
    digest: String,
    project: String,
}

impl Receipt {
    fn pending_key(&self, scope: &Scope, tool: &str) -> (String, String, String, String) {
        (
            scope.principal.client_id.clone(),
            self.project.clone(),
            tool.to_owned(),
            self.request.clone(),
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

    pub(super) fn handle_external_call(&mut self, call: Call, cx: &mut Context<Self>) {
        let Call {
            principal,
            tool,
            arguments,
            reply,
        } = call;
        let definition = match tools::validate(tool, &arguments) {
            Ok(definition) => definition,
            Err(error) => {
                let _ = reply.send(Err(error));
                return;
            }
        };
        if !principal.allows(&definition.requires) {
            let error = format!("This client lacks permission for {tool}.");
            self.external_audit_entry(
                &principal,
                tool,
                None,
                None,
                "denied",
                definition.requires.access,
                cx,
            );
            let _ = reply.send(Err(error));
            return;
        }
        let scope = self.external_scope(principal);
        if !definition.mutation {
            self.external_dispatch(scope, tool, arguments, None, reply, cx);
            return;
        }

        let request = match board_api::normalize_request_id(arguments["requestId"].as_str(), None) {
            Ok(request) => request,
            Err(error) => {
                let _ = reply.send(Err(error));
                return;
            }
        };
        // Authorize against current grants before any receipt is read, so a
        // replay never returns a result the caller can no longer reach.
        let project = match self.external_mutation_project(&scope, &arguments, cx) {
            Ok(project) => molfar_core::files::path_key(&project),
            Err(error) => {
                let result = Err(error);
                self.external_audit(&scope.principal, tool, None, Some(&request), &result, cx);
                let _ = reply.send(result);
                return;
            }
        };
        let receipt = Receipt {
            request,
            digest: receipts::digest(tool, &arguments),
            project,
        };
        let key = receipt.pending_key(&scope, tool);
        if !self.external.pending.insert(key.clone()) {
            let _ = reply.send(Err(
                "This request is still running; retry with the same requestId.".into(),
            ));
            return;
        }
        let store = self.store.clone();
        let client = scope.principal.client_id.clone();
        let saved = receipt.clone();
        let begin = cx.background_executor().spawn(async move {
            locked(&store)?.external_receipt_begin(
                &client,
                &receipts::ReceiptTarget::Project(saved.project),
                tool,
                &saved.request,
                &saved.digest,
            )
        });
        cx.spawn(async move |this, cx| {
            let begin = begin.await;
            let _ = this.update(cx, |this, cx| {
                let replay = match begin {
                    // An interrupted call runs again: every mutation resolves its
                    // durable target identity first and never repeats accepted work.
                    Ok(BEGIN::Fresh | BEGIN::Pending) => None,
                    Ok(BEGIN::Replay(result)) => Some(result),
                    Ok(BEGIN::Conflict) => Some(Err(
                        "requestId was already used with different input.".to_owned(),
                    )),
                    Err(error) => Some(Err(format!("Cannot read request receipt: {error}"))),
                };
                if let Some(result) = replay {
                    this.external.pending.remove(&key);
                    this.external_audit(
                        &scope.principal,
                        tool,
                        None,
                        Some(&receipt.request),
                        &result,
                        cx,
                    );
                    let _ = reply.send(result);
                    return;
                }
                this.external_dispatch(scope, tool, arguments, Some(receipt), reply, cx);
            });
        })
        .detach();
    }
}
