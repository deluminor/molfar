use super::*;
use gpui::Task;
use molfar_core::task_board::stage::{
    choice::settings::SettingsPatch,
    lifecycle::types::{ActionEffect, StageAction},
};

impl Shell {
    pub(in crate::shell) fn board_action(
        &mut self,
        card_id: String,
        updated_at: i64,
        action: StageAction,
        cx: &mut Context<Self>,
    ) {
        let work = self.board_stage_run(card_id, updated_at, action, None, cx);
        cx.spawn(async move |this, cx| {
            let result = work.await;
            let _ = this.update(cx, |this, cx| {
                if let Some(board) = &this.board {
                    board.update(cx, |board, cx| board.finish_update(result.err(), cx));
                }
            });
        })
        .detach();
    }

    pub(in crate::shell) fn board_stage_run(
        &mut self,
        card_id: String,
        updated_at: i64,
        action: StageAction,
        projects: Option<Vec<String>>,
        cx: &mut Context<Self>,
    ) -> Task<Result<ActionEffect, String>> {
        let cancel = action == StageAction::Cancel;
        let store = self.store.clone();
        let work = cx.background_executor().spawn(async move {
            let mut store = locked(&store)?;
            let effect = match projects {
                Some(projects) => molfar_core::app_access::board::stage::apply(
                    &mut store, &projects, &card_id, updated_at, action,
                ),
                None => store.board_stage_action(&card_id, updated_at, action),
            }?;
            let stop = effect
                .stop_session_id
                .as_deref()
                .and_then(|id| store.resolve_existing_session_id(id));
            Ok::<_, String>((effect, stop))
        });
        cx.spawn(async move |this, cx| {
            let (effect, stop) = work.await?;
            this.update(cx, |this, cx| {
                if cancel {
                    this.board_state.preparing.remove(&effect.card.id);
                }
                if let Some(view) = stop.and_then(|id| this.sessions.get(&id)) {
                    view.update(cx, |view, cx| view.stop_app_session(cx));
                }
                this.poll_board(true, cx);
            })
            .map_err(|error| error.to_string())?;
            Ok(effect)
        })
    }

    pub(in crate::shell) fn board_update_settings(
        &mut self,
        patch: SettingsPatch,
        cx: &mut Context<Self>,
    ) {
        let store = self.store.clone();
        let work = cx
            .background_executor()
            .spawn(async move { locked(&store)?.board_update_settings(&patch) });
        cx.spawn(async move |this, cx| {
            let result = work.await;
            let _ = this.update(cx, |this, cx| {
                let error = result.err();
                if let Some(board) = &this.board {
                    board.update(cx, |board, cx| board.finish_settings_update(error, cx));
                }
                this.poll_board(true, cx);
            });
        })
        .detach();
    }

    pub(in crate::shell) fn open_board_session(
        &mut self,
        persisted: String,
        cx: &mut Context<Self>,
    ) {
        let store = self.store.clone();
        let work = cx
            .background_executor()
            .spawn(async move { locked(&store)?.resolve_session_id(&persisted) });
        cx.spawn(async move |this, cx| {
            let result = work.await;
            let _ = this.update_in(cx, |this, window, cx| match result {
                Ok(id) => {
                    this.open(id, window, cx);
                }
                Err(error) => {
                    this.error = Some(error);
                    cx.notify();
                }
            });
        })
        .detach();
    }
}
