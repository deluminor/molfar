use super::Timeline;
use gpui::Context;
use std::time::Duration;

const TICK: Duration = Duration::from_secs(1);

impl Timeline {
    pub(super) fn start_clock(&mut self, cx: &mut Context<Self>) {
        if !self.visible || !self.runs.iter().any(|run| run.completed_at.is_none()) {
            return;
        }
        let origin = self.now;
        let started = cx.background_executor().now();
        self.task = Some(cx.spawn(async move |this, cx| {
            loop {
                cx.background_executor().timer(TICK).await;
                let elapsed = cx
                    .background_executor()
                    .now()
                    .duration_since(started)
                    .as_millis();
                let now = (origin as i128 + elapsed as i128).min(i64::MAX as i128) as i64;
                if this
                    .update(cx, |this, cx| {
                        this.now = now;
                        cx.notify();
                    })
                    .is_err()
                {
                    break;
                }
            }
        }));
    }
}
