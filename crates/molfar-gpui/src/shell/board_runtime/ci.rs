use super::*;
use molfar_core::task_board::delivery::{
    port::GitDelivery,
    record,
    service::ci::{self, CiProgress},
    types::DeliveryStep,
};

impl Shell {
    /// Looks at CI for every card waiting on its pull request. Network errors are transient:
    /// the card keeps waiting and the next look retries.
    pub(super) fn poll_board_ci(&mut self, cx: &mut Context<Self>) {
        if self.board_state.ci_polling {
            return;
        }
        self.board_state.ci_polling = true;
        let store = self.store.clone();
        let work = cx.background_executor().spawn(async move {
            let cards = locked(&store)?.board_waiting_ci()?;
            let mut passed = Vec::new();
            let mut errors = Vec::new();
            for card in cards {
                match ci::check(&store, &GitDelivery, &card) {
                    Ok(CiProgress::Passed(card)) => passed.push(card),
                    Ok(_) => {}
                    Err(error) => errors.push(format!("#{} CI: {error}", card.number)),
                }
            }
            Ok::<_, String>((passed, errors))
        });
        cx.spawn(async move |this, cx| {
            let result = work.await;
            let _ = this.update(cx, |this, cx| {
                this.board_state.ci_polling = false;
                let error = match result {
                    Ok((passed, errors)) => {
                        for card in passed {
                            let Some(delivery) = record::parse(card.delivery_json.as_deref())
                            else {
                                continue;
                            };
                            this.publish_delivery(
                                card.id,
                                delivery.method,
                                DeliveryStep::Complete,
                                cx,
                            );
                        }
                        (!errors.is_empty()).then(|| errors.join(" · "))
                    }
                    Err(error) => Some(error),
                };
                this.finish_board_ci(error, cx);
            });
        })
        .detach();
    }

    /// The user already chose to deliver; a card back from a CI fix with a clean review
    /// goes out again on its own.
    pub(super) fn redeliver_board_cards(
        &mut self,
        due: Vec<(
            String,
            i64,
            molfar_core::task_board::delivery::types::DeliveryMethod,
        )>,
        cx: &mut Context<Self>,
    ) {
        let listed: HashSet<String> = due.iter().map(|(id, _, _)| id.clone()).collect();
        self.board_state
            .redelivering
            .retain(|id| listed.contains(id));
        for (id, updated_at, method) in due {
            if self.board_state.redelivering.insert(id.clone()) {
                self.board_deliver(id, updated_at, method, cx);
            }
        }
    }
}
