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
        let target = match self.external_mutation_target(&scope, &arguments, cx) {
            Ok(target) => target,
            Err(error) => {
                let result = Err(error);
                self.external_audit(&scope.principal, tool, None, Some(&request), &result, cx);
                let _ = reply.send(result);
                return;
            }
        };
        let mut receipt = Receipt {
            request,
            digest: receipts::digest(tool, &arguments),
            target,
            resumed: false,
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
                &saved.target,
                tool,
                &saved.request,
                &saved.digest,
            )
        });
        cx.spawn(async move |this, cx| {
            let begin = begin.await;
            let _ = this.update(cx, |this, cx| {
                let replay = match begin {
                    Ok(BEGIN::Fresh) => None,
                    Ok(BEGIN::Pending) if definition.resumable => {
                        receipt.resumed = true;
                        None
                    }
                    Ok(BEGIN::Pending) => {
                        this.external.pending.remove(&key);
                        let target = audit::domain_target(tool, &arguments);
                        this.external_audit_entry(
                            &scope.principal,
                            tool,
                            target.as_deref(),
                            Some(&receipt.request),
                            "unknown",
                            definition.requires.access,
                            cx,
                        );
                        let _ = reply.send(Err(OUTCOME_UNKNOWN.into()));
                        return;
                    }
                    Ok(BEGIN::Replay(result)) => Some(result),
                    Ok(BEGIN::Conflict) => Some(Err(
                        "requestId was already used with different input.".to_owned(),
                    )),
                    Err(error) => Some(Err(format!("Cannot read request receipt: {error}"))),
                };
                if let Some(result) = replay {
                    this.external.pending.remove(&key);
                    let target = audit::domain_target(tool, &arguments);
                    this.external_audit(
                        &scope.principal,
                        tool,
                        target.as_deref(),
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
