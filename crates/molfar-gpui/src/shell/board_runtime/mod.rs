mod actions;
mod ci;
mod deliver;
mod launch;
mod notices;
mod poll;
mod prepare;
mod settle;
#[cfg(test)]
mod tests;

use super::*;
use std::time::Duration;

#[derive(Default)]
pub(super) struct State {
    #[cfg(test)]
    fixture: Option<tests::fixtures::Provider>,
    #[cfg(test)]
    registrations: Vec<crate::runtime::test_provider::Registration>,
    polling: bool,
    again: bool,
    preparing: HashMap<String, String>,
    running: HashMap<i64, String>,
    /// Reused sessions compacting before their run's prompt: session → (card, run, settings).
    compacting: HashMap<i64, (String, String, molfar_core::agent::Settings)>,
    ci_polling: bool,
    ci_error: Option<String>,
    redelivering: HashSet<String>,
    pub owned: HashSet<i64>,
    pub ownership_ready: bool,
    pub attention: usize,
}

impl Shell {
    pub(super) fn initialize_board_runtime(&mut self, cx: &mut Context<Self>) {
        self.reconcile_board_deliveries(cx);
        self.poll_board(!cx.is_test(), cx);
        if cx.is_test() {
            return;
        }
        cx.spawn(async move |this, cx| {
            loop {
                cx.background_executor()
                    .timer(Duration::from_secs(60))
                    .await;
                if this
                    .update(cx, |this, cx| {
                        this.poll_board(true, cx);
                        this.poll_board_ci(cx);
                    })
                    .is_err()
                {
                    break;
                }
            }
        })
        .detach();
    }

    pub(super) fn board_session_changed(&mut self, id: i64, cx: &mut Context<Self>) {
        self.send_after_compaction(id, cx);
        if self.board_state.running.contains_key(&id) {
            self.poll_board(true, cx);
        }
    }

    /// Compaction ended (or never started): send the run's prompt if the run still owns
    /// its card, then release the claim either way.
    fn send_after_compaction(&mut self, id: i64, cx: &mut Context<Self>) {
        let busy = self
            .sessions
            .get(&id)
            .is_none_or(|view| view.read(cx).external_submission_pending());
        if busy {
            return;
        }
        let Some((card, run, settings)) = self.board_state.compacting.remove(&id) else {
            return;
        };

        let store = self.store.clone();
        let check = run.clone();
        let current = cx
            .background_executor()
            .spawn(async move { locked(&store)?.board_stage_is_current(&check) });
        cx.spawn(async move |this, cx| {
            let current = current.await;
            let _ = this.update(cx, |this, cx| {
                match (current, this.sessions.get(&id).cloned()) {
                    (Ok(true), Some(view)) => {
                        view.update(cx, |view, cx| view.install_queued_app_launch(settings, cx));
                    }
                    (Err(error), _) => this.error = Some(format!("Task Board launch: {error}")),
                    _ => {}
                }
                this.release_board_claim(&card, &run);
                this.poll_board(true, cx);
            });
        })
        .detach();
    }

    pub(super) fn release_board_claim(&mut self, card: &str, run: &str) {
        if self.board_state.preparing.get(card).map(String::as_str) == Some(run) {
            self.board_state.preparing.remove(card);
        }
    }

    pub(super) fn refresh_board(&mut self, cx: &mut Context<Self>) {
        if let Some(view) = &self.board {
            view.update(cx, |board, cx| board.refresh(cx));
        }
        self.invalidate_chrome(cx);
        cx.notify();
    }

    pub(super) fn open_board_card(
        &mut self,
        card_id: String,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.close_settings(window, cx);
        self.open_board(window, cx);
        if let Some(board) = &self.board {
            board.update(cx, |board, cx| board.reveal_card(card_id, cx));
        }
    }
}
