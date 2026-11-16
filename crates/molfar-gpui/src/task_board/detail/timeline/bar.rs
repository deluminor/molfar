use super::{OpenSession, Timeline, layout::Lane};
use crate::theme::content;
use gpui::{AnyElement, Context, SharedString, div, prelude::*, px};
use molfar_core::task_board::types::StageRun;

impl Timeline {
    pub(super) fn interval_bar(
        &self,
        run: &StageRun,
        lane: &Lane,
        prefix: &'static str,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let tone = super::status::presentation(&run.status).1;
        div()
            .id(SharedString::from(format!("{prefix}-bar-{}", run.id)))
            .when_some(run.session_id.clone(), |d, session| {
                d.cursor_pointer()
                    .on_click(cx.listener(move |this, _, window, cx| {
                        this.close_dialog(window, cx);
                        cx.emit(OpenSession(session.clone()))
                    }))
            })
            .debug_selector({
                let id = run.id.clone();
                move || format!("{prefix}-bar-{id}")
            })
            .relative()
            .h(px(12.))
            .w_full()
            .bg(content(0.04))
            .child(
                div()
                    .id(SharedString::from(format!("{prefix}-mark-{}", run.id)))
                    .debug_selector({
                        let id = run.id.clone();
                        move || format!("{prefix}-mark-{id}")
                    })
                    .absolute()
                    .left(gpui::relative(lane.start))
                    .w(gpui::relative(lane.width))
                    .min_w(px(2.))
                    .when(!lane.available, |d| d.opacity(0.))
                    .h_full()
                    .rounded_sm()
                    .hover(|style| style.opacity(0.8))
                    .bg(tone),
            )
            .into_any_element()
    }
}
