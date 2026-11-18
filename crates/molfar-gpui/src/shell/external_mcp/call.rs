use super::*;

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
        let target = match domain_target
            .map_or_else(|| self.external_mutation_target(&scope, &arguments, cx), Ok)
        {
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
