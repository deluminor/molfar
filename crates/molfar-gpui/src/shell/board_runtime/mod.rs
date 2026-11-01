mod actions;
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
    pub owned: HashSet<i64>,
    pub ownership_ready: bool,
    pub attention: usize,
}

impl Shell {
    pub(super) fn initialize_board_runtime(&mut self, cx: &mut Context<Self>) {
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
                    .update(cx, |this, cx| this.poll_board(true, cx))
                    .is_err()
                {
                    break;
                }
            }
        })
        .detach();
    }

    pub(super) fn board_session_changed(&mut self, id: i64, cx: &mut Context<Self>) {
        if self.board_state.running.contains_key(&id) {
            self.poll_board(true, cx);
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
