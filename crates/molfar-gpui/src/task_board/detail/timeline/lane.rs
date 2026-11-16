use super::super::super::{controls, kanban::look};
use super::{OpenSession, Timeline, elapsed, layout::Lane};
use crate::theme::*;
use gpui::{AnyElement, Context, FontWeight, div, prelude::*, px};
use molfar_core::task_board::{
    constants::COLUMNS, stage::lifecycle::constants::RUNNING, types::StageRun,
};

impl Timeline {
    pub(super) fn lane(
        &self,
        run: &StageRun,
        lane: &Lane,
        last: bool,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let name = COLUMNS
            .iter()
            .find(|(id, _)| *id == run.stage)
            .map_or(run.stage.as_str(), |(_, name)| *name);
        let (glyph, _) = look::look(&run.stage);
        let (status, tone) = super::status::presentation(&run.status);
        let elapsed = Some(elapsed::label(lane.elapsed));
        let session = run.session_id.clone();

        div()
            .id(gpui::SharedString::from(format!("board-run-{}", run.id)))
            .flex()
            .gap_3()
            .child(
                div()
                    .w(px(26.))
                    .flex_shrink_0()
                    .flex()
                    .flex_col()
                    .items_center()
                    .child(
                        div()
                            .size(px(26.))
                            .rounded_full()
                            .border_1()
                            .border_color(content(0.09))
                            .flex()
                            .items_center()
                            .justify_center()
                            .child(icon(glyph, 12.).text_color(tone)),
                    )
                    .when(!last, |rail| {
                        rail.child(div().w(px(1.)).flex_1().min_h(px(12.)).bg(content(0.12)))
                    }),
            )
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .flex()
                    .flex_col()
                    .gap_1()
                    .pt(px(3.))
                    .when(!last, |text| text.pb_4())
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .flex_wrap()
                            .gap_2()
                            .text_size(px(12.))
                            .child(div().font_weight(FontWeight::MEDIUM).child(name.to_owned()))
                            .when(run.attempt > 1, |d| {
                                d.child(
                                    div()
                                        .text_color(content(0.5))
                                        .child(format!("attempt {}", run.attempt)),
                                )
                            })
                            .child(div().text_color(tone).child(status.to_owned())),
                    )
                    .child(
                        div()
                            .min_w_0()
                            .truncate()
                            .text_size(px(11.))
                            .text_color(content(0.55))
                            .child(format!(
                                "{} · {}",
                                run.harness,
                                controls::model_label(&run.harness, &run.model)
                            )),
                    )
                    .child(
                        div()
                            .id(gpui::SharedString::from(format!(
                                "board-run-bar-{}",
                                run.id
                            )))
                            .when_some(run.session_id.clone(), |d, session| {
                                d.cursor_pointer().on_click(cx.listener(move |_, _, _, cx| {
                                    cx.emit(OpenSession(session.clone()))
                                }))
                            })
                            .debug_selector({
                                let id = run.id.clone();
                                move || format!("board-run-bar-{id}")
                            })
                            .relative()
                            .h(px(12.))
                            .w_full()
                            .bg(content(0.04))
                            .child(
                                div()
                                    .id(gpui::SharedString::from(format!(
                                        "board-run-mark-{}",
                                        run.id
                                    )))
                                    .debug_selector({
                                        let id = run.id.clone();
                                        move || format!("board-run-mark-{id}")
                                    })
                                    .absolute()
                                    .left(gpui::relative(lane.start))
                                    .w(gpui::relative(lane.width))
                                    .min_w(px(2.))
                                    .h_full()
                                    .rounded_sm()
                                    .bg(tone),
                            ),
                    )
                    .when(run.completed_at.is_none() && run.status != RUNNING, |d| {
                        d.child(
                            div()
                                .text_size(px(11.))
                                .text_color(content(0.5))
                                .child("Completion time unavailable"),
                        )
                    })
                    .when_some(run.error.clone(), |d, error| {
                        d.child(
                            div()
                                .id(gpui::SharedString::from(format!(
                                    "board-run-error-{}",
                                    run.id
                                )))
                                .debug_selector({
                                    let id = run.id.clone();
                                    move || format!("board-run-error-{id}")
                                })
                                .text_size(px(11.))
                                .text_color(look::rose(1.))
                                .child(error),
                        )
                    }),
            )
            .child(
                div()
                    .w(px(100.))
                    .flex_shrink_0()
                    .flex()
                    .items_start()
                    .gap_2()
                    .py_1()
                    .text_size(px(11.))
                    .text_color(content(0.5))
                    .when_some(elapsed, |d, elapsed| d.child(elapsed))
                    .when_some(session, |d, session| {
                        d.child(
                            controls::ghost_button(
                                gpui::SharedString::from(format!("board-run-open-{}", run.id)),
                                "",
                            )
                            .child(icon("external-link", 12.))
                            .aria_label(format!("Open {name} attempt {} session", run.attempt))
                            .track_focus(&self.session_focus[&run.id])
                            .tab_index(0)
                            .on_key_down({
                                let session = session.clone();
                                cx.listener(move |_, event: &gpui::KeyDownEvent, _, cx| {
                                    if matches!(event.keystroke.key.as_str(), "enter" | "space") {
                                        cx.emit(OpenSession(session.clone()));
                                        cx.stop_propagation();
                                    }
                                })
                            })
                            .size(px(24.))
                            .debug_selector({
                                let id = run.id.clone();
                                move || format!("board-run-open-{id}")
                            })
                            .on_click(
                                cx.listener(move |_, _, _, cx| {
                                    cx.emit(OpenSession(session.clone()))
                                }),
                            ),
                        )
                    }),
            )
            .into_any_element()
    }
}
