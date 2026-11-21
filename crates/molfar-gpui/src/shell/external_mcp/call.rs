use super::*;
use molfar_core::external_mcp::tools::sessions;

impl Shell {
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
                (tool == sessions::START).then_some(false),
                cx,
            );
            let _ = reply.send(Err(error));
            return;
        }
        let scope = self.external_scope(principal);
        let domain_target = match self.external_domain_target(&scope, definition, &arguments, cx) {
            Ok(target) => target,
            Err(error) => {
                let target = audit::domain_target(tool, &arguments);
                self.external_audit_entry(
                    &scope.principal,
                    tool,
                    target.as_deref(),
                    arguments["requestId"].as_str(),
                    "denied",
                    definition.requires.access,
                    (tool == sessions::START).then_some(false),
                    cx,
                );
                let _ = reply.send(Err(error));
                return;
            }
        };
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
        let digest = receipts::digest(tool, &arguments);
        let target = match domain_target.map_or_else(
            || self.external_mutation_target(&scope, tool, &arguments, cx),
            Ok,
        ) {
            Ok(target) => target,
            Err(error) => {
                let result = self
                    .external_deleted_replay(&scope, tool, &arguments, &request, &digest)
                    .unwrap_or(Err(error));
                let target = audit::target(&result);
                self.external_audit(
                    &scope.principal,
                    tool,
                    target.as_deref(),
                    Some(&request),
                    &result,
                    cx,
                );
                let _ = reply.send(result);
                return;
            }
        };
        let operator = if tool == sessions::START {
            let default = super::super::session_loading::new_session_operator(
                arguments["project"].as_str().unwrap_or_default(),
                cx,
            );
            match sessions::launch_operator(
                arguments["operator"].as_bool(),
                default,
                scope.permits_operator(),
            ) {
                Ok(enabled) => Some(enabled),
                Err(error) => {
                    self.external_audit_entry(
                        &scope.principal,
                        tool,
                        arguments["project"].as_str(),
                        Some(&request),
                        "denied",
                        definition.requires.access,
                        Some(false),
                        cx,
                    );
                    let _ = reply.send(Err(error));
                    return;
                }
            }
        } else {
            None
        };
        let mut receipt = Receipt {
            request,
            digest,
            target,
            resumed: false,
            operator,
        };
        let key = receipt.pending_key(&scope, tool);
        if let Some(pending) = self.external.pending.get(&key) {
            let error = if pending == &receipt.digest {
                "This request is still running; retry with the same requestId."
            } else {
                "requestId was already used with different input."
            };
            let _ = reply.send(Err(error.into()));
            return;
        }
        self.external
            .pending
            .insert(key.clone(), receipt.digest.clone());
        let store = self.store.clone();
        let client = scope.principal.client_id.clone();
        let saved = receipt.clone();
        let begin = cx.background_executor().spawn(async move {
            locked(&store)?.external_receipt_reserve(
                &client,
                &saved.target,
                tool,
                &saved.request,
                &saved.digest,
                saved.operator,
            )
        });
        cx.spawn(async move |this, cx| {
            let begin = begin.await;
            let _ = this.update(cx, |this, cx| {
                let begin = begin.map(|(begin, operator)| {
                    receipt.operator = operator;
                    begin
                });
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
                            (tool == sessions::START).then_some(false),
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
                if let Some(mut result) = replay {
                    if tool == sessions::START
                        && let Ok(value) = &mut result
                    {
                        value["operator"] = json!(receipt.operator.unwrap_or(false));
                    }
                    this.external.pending.remove(&key);
                    let target =
                        audit::domain_target(tool, &arguments).or_else(|| audit::target(&result));
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
                if receipt.operator == Some(true) && !scope.permits_operator() {
                    this.external.pending.remove(&key);
                    this.external_audit_entry(
                        &scope.principal,
                        tool,
                        arguments["project"].as_str(),
                        Some(&receipt.request),
                        "denied",
                        definition.requires.access,
                        Some(false),
                        cx,
                    );
                    let _ = reply.send(Err(sessions::OPERATOR_REQUIRED.into()));
                    return;
                }
                this.external_dispatch(scope, tool, arguments, Some(receipt), reply, cx);
            });
        })
        .detach();
    }
}
