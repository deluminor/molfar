use super::*;
use molfar_core::app_access::board::stage::{StageTool, stage_action};

impl Shell {
    pub(super) fn external_stage_tool(
        &mut self,
        scope: &Scope,
        tool: StageTool,
        arguments: &Value,
        done: Done,
        cx: &mut Context<Self>,
    ) {
        let (card, expected, action) = match stage_action(tool, arguments) {
            Ok(action) => action,
            Err(error) => {
                let _ = done.try_send(Err(error));
                return;
            }
        };
        let work = self.board_stage_run(
            card.clone(),
            expected,
            action,
            Some(scope.projects.clone()),
            cx,
        );
        let store = self.store.clone();
        let projects = scope.projects.clone();
        cx.spawn(async move |_, cx| {
            let result = match work.await {
                Ok(_) => {
                    cx.background_executor()
                        .spawn(async move {
                            board_api::external_read(
                                &*locked(&store)?,
                                &json!({"cardId":card}),
                                &projects,
                            )
                        })
                        .await
                }
                Err(error) => Err(error),
            };
            let _ = done.send(result).await;
        })
        .detach();
    }
}
