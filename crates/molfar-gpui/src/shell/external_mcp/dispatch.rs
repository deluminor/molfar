use super::audit::target;
use super::*;

impl Shell {
    pub(super) fn external_dispatch(
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
            "board_list" | "board_read" | "board_create" | "board_update" | "board_archive"
            | "board_unarchive" => {
                self.external_board_tool(&scope, tool, arguments, receipt.as_ref(), done, cx)
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
                        &receipts::ReceiptTarget::Project(receipt.project),
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
}
