use super::*;

impl Shell {
    pub(super) fn external_board_tool(
        &mut self,
        scope: &Scope,
        tool: &str,
        arguments: Value,
        receipt: Option<&Receipt>,
        done: Done,
        cx: &mut Context<Self>,
    ) {
        let mutation = receipt.is_some();
        let store = self.store.clone();
        let owner = scope.owner();
        let envelope = receipt.map_or("read".to_owned(), |receipt| receipt.request.clone());
        let projects = scope.projects.clone();
        let action = tool.replacen('_', ".", 1);
        let work = cx.background_executor().spawn(async move {
            board_api::action(
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
            if mutation && result.is_ok() {
                let _ = this.update(cx, |this, cx| this.refresh_board(cx));
            }
            let _ = done.send(result).await;
        })
        .detach();
    }
}
