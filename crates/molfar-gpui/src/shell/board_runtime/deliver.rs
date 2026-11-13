use super::*;
use molfar_core::task_board::delivery::{
    constants::INTERRUPTED,
    port::GitDelivery,
    service::{self, reject::reject_cleanup},
    types::{DeliveryMethod, DeliveryStep, Finished, Published},
};

impl Shell {
    pub(in crate::shell) fn board_deliver(
        &mut self,
        card_id: String,
        updated_at: i64,
        method: DeliveryMethod,
        cx: &mut Context<Self>,
    ) {
        let store = self.store.clone();
        let id = card_id.clone();
        let started = cx
            .background_executor()
            .spawn(async move { locked(&store)?.board_deliver_start(&id, updated_at) });
        cx.spawn(async move |this, cx| {
            let result = started.await.map(|_| ());
            let accepted = result.is_ok();
            let _ = this.update(cx, |this, cx| {
                this.finish_board_update(result.err(), cx);
                if accepted {
                    this.publish_delivery(card_id, method, DeliveryStep::Open, cx);
                }
            });
        })
        .detach();
    }

    /// `Open` pushes and opens the pull request, then CI decides; `Complete` runs after
    /// green CI and finishes (merge, cleanup, Done). Keep branch has no CI to wait for.
    pub(super) fn publish_delivery(
        &mut self,
        card_id: String,
        method: DeliveryMethod,
        step: DeliveryStep,
        cx: &mut Context<Self>,
    ) {
        let store = self.store.clone();
        let wait = step == DeliveryStep::Open && method != DeliveryMethod::Keep;
        let work = cx.background_executor().spawn(async move {
            let published = service::publish(&store, &GitDelivery, &card_id, method, step)
                .and_then(|published| {
                    if wait {
                        locked(&store)?.board_await_ci(&card_id, &published.delivery)?;
                        return Ok(None);
                    }
                    Ok(Some(published))
                });
            // The card records the delivery error itself; only a failed record is reported here.
            published.map_err(|error| service::fail(&store, &card_id, &error).err())
        });
        cx.spawn(async move |this, cx| {
            let result = work.await;
            let _ = this.update(cx, |this, cx| match result {
                Ok(Some(published)) => this.finish_delivery(published, cx),
                Ok(None) => this.finish_board_background(None, cx),
                Err(unrecorded) => this.finish_board_background(unrecorded, cx),
            });
        })
        .detach();
    }

    fn finish_delivery(&mut self, published: Published, cx: &mut Context<Self>) {
        let id = published.card.id.clone();
        let path = published.worktree.clone();
        let blocked = path
            .as_deref()
            .and_then(|path| self.worktree_in_use(path, cx));
        let store = self.store.clone();
        let work = cx.background_executor().spawn(async move {
            service::finish(&store, &GitDelivery, published, blocked).map_err(|error| {
                match service::fail(&store, &id, &error) {
                    Ok(_) => error,
                    Err(recorded) => format!("{error} {recorded}"),
                }
            })
        });
        cx.spawn(async move |this, cx| {
            let result = work.await;
            let _ = this.update(cx, |this, cx| {
                let error = match result {
                    Ok(finished) => this.apply_cleanup(path.as_deref(), finished, cx),
                    Err(error) => Some(error),
                };
                this.finish_board_background(error, cx);
            });
        })
        .detach();
    }

    fn apply_cleanup(
        &mut self,
        path: Option<&str>,
        finished: Finished,
        cx: &mut Context<Self>,
    ) -> Option<String> {
        if let Some(path) = path.filter(|_| finished.removed) {
            self.apply_detached_worktree(path, finished.detached, cx);
        }
        finished.notice
    }

    pub(in crate::shell) fn board_reject(
        &mut self,
        card_id: String,
        updated_at: i64,
        cx: &mut Context<Self>,
    ) {
        let store = self.store.clone();
        let id = card_id.clone();
        let read = cx
            .background_executor()
            .spawn(async move { locked(&store)?.board_card(&id) });
        cx.spawn(async move |this, cx| {
            let result = read.await;
            let _ = this.update(cx, |this, cx| {
                let blocked = result.as_ref().ok().and_then(|card| {
                    card.worktree_path
                        .as_deref()
                        .and_then(|path| this.worktree_in_use(path, cx))
                });
                match (result, blocked) {
                    (Err(error), _) => this.finish_board_update(Some(error), cx),
                    (Ok(_), Some(reason)) => this.finish_board_update(Some(reason.into()), cx),
                    (Ok(_), None) => this.archive_card(card_id, updated_at, cx),
                }
            });
        })
        .detach();
    }

    fn archive_card(&mut self, card_id: String, updated_at: i64, cx: &mut Context<Self>) {
        let store = self.store.clone();
        let work = cx.background_executor().spawn(async move {
            let (before, archived) = locked(&store)?.board_reject(&card_id, updated_at)?;
            let finished = reject_cleanup(&store, &GitDelivery, &before, archived)?;
            Ok::<_, String>((before.worktree_path, finished))
        });
        cx.spawn(async move |this, cx| {
            let result = work.await;
            let _ = this.update(cx, |this, cx| {
                let error = match result {
                    Ok((path, finished)) => this.apply_cleanup(path.as_deref(), finished, cx),
                    Err(error) => Some(error),
                };
                this.finish_board_update(error, cx);
            });
        })
        .detach();
    }

    /// Startup only: a delivery that was running when the app quit resumes on the next Deliver.
    pub(super) fn reconcile_board_deliveries(&mut self, cx: &mut Context<Self>) {
        let store = self.store.clone();
        let work = cx.background_executor().spawn(async move {
            let stuck = locked(&store)?.board_stuck_deliveries()?;
            let errors: Vec<String> = stuck
                .iter()
                .filter_map(|id| service::fail(&store, id, INTERRUPTED).err())
                .collect();
            if errors.is_empty() {
                Ok(())
            } else {
                Err(format!(
                    "Interrupted Board deliveries could not be reset: {}",
                    errors.join("; ")
                ))
            }
        });
        cx.spawn(async move |this, cx| {
            let error = work.await.err();
            let _ = this.update(cx, |this, cx| {
                if this.board.is_none() && error.is_some() {
                    this.error = error.clone();
                    cx.notify();
                }
                this.finish_board_background(error, cx);
            });
        })
        .detach();
    }

    /// Work that outlives the owner's action: it must not complete whatever the board is waiting for now.
    pub(super) fn finish_board_background(
        &mut self,
        error: Option<String>,
        cx: &mut Context<Self>,
    ) {
        if let Some(board) = &self.board {
            board.update(cx, |board, cx| board.finish_background(error, cx));
        }
        self.poll_board(true, cx);
    }

    /// CI looks repeat every minute, so a lasting outage shows once rather than as a new error each time.
    pub(super) fn finish_board_ci(&mut self, error: Option<String>, cx: &mut Context<Self>) {
        if error.is_some() && error == self.board_state.ci_error {
            return;
        }
        self.board_state.ci_error = error.clone();
        self.finish_board_background(error, cx);
    }

    fn finish_board_update(&mut self, error: Option<String>, cx: &mut Context<Self>) {
        if let Some(board) = &self.board {
            board.update(cx, |board, cx| board.finish_update(error, cx));
        }
        self.poll_board(true, cx);
    }
}
