use super::{
    super::{Home, layout::model::WidgetId},
    feeds::{self, HOST_INTERVAL, Load, RECORDS_EVERY, Sources},
};
use gpui::Context;

impl Home {
    pub(crate) fn set_sources(&mut self, sources: Sources, cx: &mut Context<Self>) {
        self._inbox = sources
            .inbox
            .as_ref()
            .map(|inbox| cx.observe(inbox, |_, _, cx| cx.notify()));
        self.sources = sources;
        if self._poll.is_none() {
            self._poll = Some(cx.spawn(async move |this, cx| {
                loop {
                    cx.background_executor().timer(HOST_INTERVAL).await;
                    if this.update(cx, |this, cx| this.tick(cx)).is_err() {
                        break;
                    }
                }
            }));
        }
        self.refresh_records(cx);
        self.sample_host(cx);
    }

    /// Polls only while Home is on screen; a hidden page costs nothing.
    fn tick(&mut self, cx: &mut Context<Self>) {
        if !self.visible {
            return;
        }
        self.feeds.ticks = self.feeds.ticks.wrapping_add(1);
        self.sample_host(cx);
        if self.feeds.ticks.is_multiple_of(RECORDS_EVERY) {
            self.refresh_records(cx);
        }
    }

    pub(in crate::home) fn sample_host(&mut self, cx: &mut Context<Self>) {
        if self.state.is_hidden(WidgetId::Host) {
            return;
        }
        let sampler = self.feeds.sampler.clone();
        let work = cx
            .background_executor()
            .spawn(async move { feeds::sample_host(&sampler) });
        cx.spawn(async move |this, cx| {
            let sample = work.await;
            let _ = this.update(cx, |this, cx| {
                this.feeds.host.push(sample);
                cx.notify();
            });
        })
        .detach();
    }

    pub(crate) fn refresh_records(&mut self, cx: &mut Context<Self>) {
        if self.feeds.loading_records {
            return;
        }
        self.feeds.loading_records = true;
        if !self.state.is_hidden(WidgetId::Usage) {
            super::usage::request(&self.sources.project, cx);
        }

        let store = self.sources.store.clone();
        let service = self.sources.automations.clone();
        let sessions = cx
            .background_executor()
            .spawn(async move { feeds::load_sessions(store) });
        let automations = cx
            .background_executor()
            .spawn(async move { feeds::load_automations(service) });
        cx.spawn(async move |this, cx| {
            let (sessions, automations) = (sessions.await, automations.await);
            let _ = this.update(cx, |this, cx| {
                this.feeds.loading_records = false;
                this.feeds.sessions = loaded("sessions", sessions);
                if let Some(automations) = automations {
                    this.feeds.automations = loaded("automations", automations);
                }
                cx.notify();
            });
        })
        .detach();
    }
}

fn loaded<T>(what: &str, result: Result<T, String>) -> Load<T> {
    match result {
        Ok(value) => Load::Ready(value),
        Err(error) => {
            eprintln!("molfar: home could not load {what}: {error}");
            Load::Failed(error)
        }
    }
}
