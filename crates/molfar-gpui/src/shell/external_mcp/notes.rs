use super::*;

impl Shell {
    pub(super) fn external_notes_tool(
        &mut self,
        scope: &Scope,
        tool: &'static str,
        arguments: Value,
        receipt: Option<&Receipt>,
        done: Done,
        cx: &mut Context<Self>,
    ) {
        let store = self.store.clone();
        let projects = scope.projects.clone();
        let client = scope.principal.client_id.clone();
        let receipt = receipt.cloned();
        let work = cx.background_executor().spawn(async move {
            let result = notes_api::action(
                &*locked(&store)?,
                tool,
                &arguments,
                &projects,
                &client,
                receipt.as_ref().map(|receipt| receipt.request.as_str()),
            )?;
            Ok::<_, String>(result)
        });
        cx.spawn(async move |_, _| {
            let _ = done.send(work.await).await;
        })
        .detach();
    }
}
