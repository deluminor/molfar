//! Runs external MCP calls inside MOLFAR: grants decide reach, MOLFAR keeps
//! models, runtime approvals and Board stages. Mutations persist a receipt
//! before dispatch so retries never repeat accepted work.
mod lifecycle;
#[cfg(test)]
mod recovery_tests;
mod sessions;
mod targets;
#[cfg(test)]
mod tests;

use super::*;
use molfar_core::{
    app_access::board,
    external_mcp::{
        receipts::{self, BEGIN},
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
        let scope = self.external_scope(principal);
        let mutation = molfar_core::external_mcp::tools::validate(tool, &arguments)
            .map(|tool| tool.mutation)
            .unwrap_or(false);
        if !mutation {
            self.external_dispatch(scope, tool, arguments, None, reply, cx);
            return;
        }

        let request = match board::normalize_request_id(arguments["requestId"].as_str(), None) {
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
                let _ = reply.send(Err(error));
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
                &saved.project,
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

    fn external_dispatch(
        &mut self,
        scope: Scope,
        tool: &'static str,
        arguments: Value,
        receipt: Option<Receipt>,
        reply: Reply,
        cx: &mut Context<Self>,
    ) {
        let (done, result) = async_channel::bounded(1);
        match tool {
            "projects_list" => {
                let projects: Vec<_> = scope
                    .projects
                    .iter()
                    .map(|path| json!({"project":path,"label":self.project_label(path)}))
                    .collect();
                let _ = done.try_send(Ok(json!({"projects":projects})));
            }
            "board_list" | "board_read" | "board_create" => {
                let store = self.store.clone();
                let owner = scope.owner();
                let envelope = receipt
                    .as_ref()
                    .map_or("read".to_owned(), |receipt| receipt.request.clone());
                let projects = scope.projects.clone();
                let action = tool.replacen('_', ".", 1);
                let work = cx.background_executor().spawn(async move {
                    board::action(
                        &mut *locked(&store)?,
                        &owner,
                        &envelope,
                        &action,
                        &arguments,
                        &projects,
                    )
                });
                cx.spawn(async move |this, cx| {
                    let result = work.await;
                    if tool == "board_create" && result.is_ok() {
                        let _ = this.update(cx, |this, cx| this.refresh_board(cx));
                    }
                    let _ = done.send(result).await;
                })
                .detach();
            }
            _ => self.external_session_tool(&scope, tool, arguments, receipt.as_ref(), done, cx),
        }

        let store = self.store.clone();
        cx.spawn(async move |this, cx| {
            let result = result
                .recv()
                .await
                .unwrap_or_else(|_| Err("MOLFAR dropped the request.".into()));
            if let Some(receipt) = receipt.clone() {
                let client = scope.principal.client_id.clone();
                let saved = result.clone();
                let finish = cx.background_executor().spawn(async move {
                    locked(&store)?.external_receipt_finish(
                        &client,
                        &receipt.project,
                        tool,
                        &receipt.request,
                        &receipt.digest,
                        &saved,
                    )
                });
                if let Err(error) = finish.await {
                    log::warn!("external MCP receipt for {tool} was not saved: {error}");
                }
            }
            let _ = this.update(cx, |this, cx| {
                if let Some(receipt) = &receipt {
                    this.external
                        .pending
                        .remove(&receipt.pending_key(&scope, tool));
                }
                let target = target(&result);
                this.external_audit(
                    &scope.principal,
                    tool,
                    target.as_deref(),
                    receipt.as_ref().map(|receipt| receipt.request.as_str()),
                    &result,
                    cx,
                );
            });
            let _ = reply.send(result);
        })
        .detach();
    }

    fn external_audit(
        &mut self,
        principal: &Principal,
        tool: &str,
        target: Option<&str>,
        request: Option<&str>,
        result: &Result<Value, String>,
        cx: &mut Context<Self>,
    ) {
        let entry = AuditEntry {
            at: i64::try_from(molfar_core::time::now_ms()).unwrap_or(i64::MAX),
            client_id: principal.client_id.clone(),
            action: tool.into(),
            target: target.map(str::to_owned),
            request_id: request.map(str::to_owned),
            outcome: if result.is_ok() { "ok" } else { "error" }.into(),
        };
        self.store_write("record external MCP audit", cx, move |store| {
            store.external_audit(entry)
        });
    }
}

fn target(result: &Result<Value, String>) -> Option<String> {
    let value = result.as_ref().ok()?;
    value["card"]["id"]
        .as_str()
        .map(str::to_owned)
        .or_else(|| value["sessionId"].as_i64().map(|id| id.to_string()))
}
