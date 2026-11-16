use super::super::{Board, Event, kanban::look};
use crate::theme::*;
use gpui::{AnyElement, Context, FontWeight, div, prelude::*, px};
use molfar_core::task_board::{
    constants::COLUMNS,
    stage::lifecycle::constants::{FAILED, PARTIAL, REDIRECTED, RUNNING, SUCCEEDED},
    types::StageRun,
};

impl Board {
    pub(super) fn stage_timeline(&self, runs: &[StageRun], cx: &mut Context<Self>) -> AnyElement {
        let mut timeline = div().flex().flex_col();
        if runs.is_empty() {
            return timeline
                .child(
                    div()
                        .text_size(px(12.))
                        .text_color(content(0.5))
                        .child("No stage runs yet"),
                )
                .into_any_element();
        }
        for (position, run) in runs.iter().enumerate() {
            // The rail joins each stage to the next; the last stage ends it.
            let last = position + 1 == runs.len();
            let name = COLUMNS
                .iter()
                .find(|(id, _)| *id == run.stage)
                .map_or(run.stage.as_str(), |(_, name)| *name);
            let (glyph, _) = look::look(&run.stage);
            let (status, tone) = match run.status.as_str() {
                SUCCEEDED => ("Succeeded", look::emerald(1.)),
                PARTIAL => ("Continued", look::amber(1.)),
                REDIRECTED => ("Sent back", look::amber(1.)),
                FAILED => ("Failed", look::rose(1.)),
                RUNNING => ("Running", accent_color()),
                _ => (run.status.as_str(), content(0.5)),
            };
            let elapsed = run
                .completed_at
                .map(|end| molfar_core::usage::duration(end.saturating_sub(run.started_at)));
            let session = run.session_id.clone();
            timeline = timeline.child(
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
                                rail.child(
                                    div().w(px(1.)).flex_1().min_h(px(12.)).bg(content(0.12)),
                                )
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
                                    .child(
                                        div()
                                            .font_weight(FontWeight::MEDIUM)
                                            .child(name.to_owned()),
                                    )
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
                                        super::super::controls::model_label(
                                            &run.harness,
                                            &run.model
                                        )
                                    )),
                            )
                            .when_some(run.error.clone(), |d, error| {
                                d.child(
                                    div()
                                        .text_size(px(11.))
                                        .text_color(look::rose(1.))
                                        .child(error),
                                )
                            }),
                    )
                    .child(
                        div()
                            .flex()
                            .items_start()
                            .gap_2()
                            .py_1()
                            .text_size(px(11.))
                            .text_color(content(0.5))
                            .when_some(elapsed, |d, elapsed| d.child(elapsed))
                            .when_some(session, |d, session| {
                                d.child(
                                    super::super::controls::ghost_button(
                                        gpui::SharedString::from(format!(
                                            "board-run-open-{}",
                                            run.id
                                        )),
                                        "",
                                    )
                                    .child(icon("external-link", 12.))
                                    .aria_label("Open stage session")
                                    .size(px(24.))
                                    .debug_selector({
                                        let id = run.id.clone();
                                        move || format!("board-run-open-{id}")
                                    })
                                    .on_click(cx.listener(
                                        move |_, _, _, cx| {
                                            cx.emit(Event::OpenSession(session.clone()))
                                        },
                                    )),
                                )
                            }),
                    ),
            );
        }
        timeline.into_any_element()
    }
}
