use super::*;

impl Shell {
    pub(super) fn external_audit(
        &mut self,
        principal: &Principal,
        tool: &str,
        target: Option<&str>,
        request: Option<&str>,
        result: &Result<Value, String>,
        cx: &mut Context<Self>,
    ) {
        let kind = tools::catalog()
            .iter()
            .find(|entry| entry.name == tool)
            .map_or(ACCESS::Standard, |entry| entry.requires.access);
        let outcome = if result.is_ok() { "ok" } else { "error" };
        self.external_audit_entry(principal, tool, target, request, outcome, kind, cx);
    }

    #[allow(clippy::too_many_arguments)]
    pub(super) fn external_audit_entry(
        &mut self,
        principal: &Principal,
        tool: &str,
        target: Option<&str>,
        request: Option<&str>,
        outcome: &str,
        kind: ACCESS,
        cx: &mut Context<Self>,
    ) {
        let entry = AuditEntry {
            at: i64::try_from(molfar_core::time::now_ms()).unwrap_or(i64::MAX),
            client_id: principal.client_id.clone(),
            action: tool.into(),
            target: target.map(str::to_owned),
            request_id: request.map(str::to_owned),
            outcome: outcome.into(),
            kind,
        };
        self.store_write("record external MCP audit", cx, move |store| {
            store.external_audit(entry)
        });
    }
}

pub(super) fn target(result: &Result<Value, String>) -> Option<String> {
    let value = result.as_ref().ok()?;
    value["card"]["id"]
        .as_str()
        .map(str::to_owned)
        .or_else(|| value["note"]["id"].as_str().map(str::to_owned))
        .or_else(|| value["sessionId"].as_i64().map(|id| id.to_string()))
}
