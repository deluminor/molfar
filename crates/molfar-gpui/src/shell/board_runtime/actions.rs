use super::*;
use molfar_core::task_board::stage::lifecycle::types::StageAction;

impl Shell {
    pub(in crate::shell) fn board_action(
        &mut self,
        card_id: String,
        updated_at: i64,
        action: StageAction,
        cx: &mut Context<Self>,
    ) {
        let store = self.store.clone();
        let card = card_id.clone();
        let work = cx.background_executor().spawn(async move {
            let mut store = locked(&store)?;
            let effect = store.board_stage_action(&card, updated_at, action)?;
            let stop = effect
                .stop_session_id
                .as_deref()
                .and_then(|id| store.resolve_existing_session_id(id));
            Ok::<_, String>(stop)
        });
        cx.spawn(async move |this, cx| {
            let result = work.await;
            let _ = this.update(cx, |this, cx| {
                let error = match result {
                    Ok(stop) => {
                        if action == StageAction::Cancel {
                            this.board_state.preparing.remove(&card_id);
                        }
                        if let Some(view) = stop.and_then(|id| this.sessions.get(&id)) {
                            view.update(cx, |view, cx| view.stop_app_session(cx));
                        }
                        None
                    }
                    Err(error) => Some(error),
                };
                if let Some(board) = &this.board {
                    board.update(cx, |board, cx| board.finish_stage_action(error, cx));
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
