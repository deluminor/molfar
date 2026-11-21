use super::*;

impl Conversation {
    pub(super) fn send_steer_with_context(&mut self, mut message: Message, cx: &mut Context<Self>) {
        let prompt = message.prepared_prompt.as_deref().unwrap_or(&message.text);
        if molfar_core::confluence::resolve::scan(prompt).is_empty() {
            self.send_steer(message, cx);
            return;
        }

        let store = self.store.clone();
        let prompt = prompt.to_owned();
        let cancellation = self.cancel.clone();
        self.follow_ups.sending = Some(message.id.clone());
        let job = cx.background_executor().spawn(async move {
            crate::confluence::service::apply_context(&store, &Default::default(), &prompt)
        });
        cx.spawn(async move |view, cx| {
            message.prepared_prompt = Some(job.await);
            let _ = view.update(cx, |this, cx| {
                if this.follow_ups.sending.as_deref() != Some(&message.id) {
                    return;
                }
                this.follow_ups.sending = None;
                if this.busy
                    && std::sync::Arc::ptr_eq(&this.cancel, &cancellation)
                    && !this.stopping
                    && this
                        .follow_ups
                        .state
                        .messages
                        .iter()
                        .any(|queued| queued.id == message.id)
                {
                    this.send_steer(message, cx);
                } else {
                    this.pump_follow_ups(cx);
                }
                cx.notify();
            });
        })
        .detach();
    }

    fn send_steer(&mut self, message: Message, cx: &mut Context<Self>) {
        let Some(controls) = &self.controls else {
            return;
        };
        let id = message.id.clone();
        if controls
            .send(Control {
                id: id.clone(),
                decision: Decision::Steer(message),
            })
            .is_ok()
        {
            self.follow_ups.sending = Some(id);
        } else {
            self.fail_follow_up(
                &id,
                "The provider disconnected before accepting this message".into(),
                cx,
            );
        }
    }
}
