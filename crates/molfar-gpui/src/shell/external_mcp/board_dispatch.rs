use super::*;

impl Shell {
    pub(super) fn external_board_tool(
        &mut self,
        scope: &Scope,
        tool: &'static str,
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
        let work = cx.background_executor().spawn(async move {
            let mut store = locked(&store)?;
            match tool {
                "board_read" => board_api::external_read(&store, &arguments, &projects),
                board_api::artifacts::LIST | board_api::artifacts::READ => {
                    board_api::artifacts::action(&store, tool, &arguments, &projects)
                }
                _ => board_api::action(
                    &mut store,
                    &owner,
                    &envelope,
                    &tool.replacen('_', ".", 1),
                    &arguments,
                    &projects,
                ),
            }
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
