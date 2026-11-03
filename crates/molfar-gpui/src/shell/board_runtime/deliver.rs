use super::*;
use molfar_core::task_board::delivery::{
    constants::INTERRUPTED,
    port::GitDelivery,
    service::{self, reject::reject_cleanup},
    types::{DeliveryMethod, Published},
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
                    this.publish_delivery(card_id, method, cx);
                }
            });
        })
        .detach();
    }

    fn publish_delivery(
        &mut self,
        card_id: String,
        method: DeliveryMethod,
        cx: &mut Context<Self>,
    ) {
        let store = self.store.clone();
        let work = cx.background_executor().spawn(async move {
            service::publish(&store, &GitDelivery, &card_id, method).map_err(|error| {
                let recorded = service::fail(&store, &card_id, &error).map(|_| ());
                (card_id, recorded)
            })
        });
        cx.spawn(async move |this, cx| {
            let result = work.await;
            let _ = this.update(cx, |this, cx| match result {
                Ok(published) => this.finish_delivery(published, cx),
                Err((_, recorded)) => this.finish_board_update(recorded.err(), cx),
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
            let finished = match blocked {
                Some(reason) => Err(reason.to_owned()),
                None => service::finish(&store, &GitDelivery, published).map(|done| done.detached),
            };
            finished.or_else(|error| {
                service::fail(&store, &id, &error)?;
                Ok::<_, String>(Vec::new())
            })
        });
        cx.spawn(async move |this, cx| {
            let result = work.await;
            let _ = this.update(cx, |this, cx| {
                let error = match result {
                    Ok(detached) => {
                        if let Some(path) = &path {
                            this.apply_detached_worktree(path, detached, cx);
                        }
                        None
                    }
                    Err(error) => Some(error),
                };
                this.finish_board_update(error, cx);
            });
        })
        .detach();
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
            Ok::<_, String>((before.worktree_path, finished.detached))
        });
        cx.spawn(async move |this, cx| {
            let result = work.await;
            let _ = this.update(cx, |this, cx| {
                let error = match result {
                    Ok((path, detached)) => {
                        if let Some(path) = path {
                            this.apply_detached_worktree(&path, detached, cx);
                        }
                        None
                    }
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
            for id in stuck {
                service::fail(&store, &id, INTERRUPTED)?;
            }
            Ok::<_, String>(())
        });
        cx.spawn(async move |this, cx| {
            let error = work.await.err();
            let _ = this.update(cx, |this, cx| this.finish_board_update(error, cx));
        })
        .detach();
    }

    fn finish_board_update(&mut self, error: Option<String>, cx: &mut Context<Self>) {
        if let Some(board) = &self.board {
            board.update(cx, |board, cx| board.finish_update(error, cx));
        }
        self.poll_board(true, cx);
    }
}
