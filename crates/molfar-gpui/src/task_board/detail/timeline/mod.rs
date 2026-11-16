mod elapsed;
mod layout;

use super::super::{Board, Event, kanban::look};
use crate::theme::*;
use gpui::{AnyElement, Context, FontWeight, div, prelude::*, px};
use molfar_core::task_board::{
    constants::COLUMNS,
    stage::lifecycle::constants::{
        CANCELLED, FAILED, INTERRUPTED, PARTIAL, REDIRECTED, RUNNING, SUCCEEDED,
    },
    types::{Card, StageRun},
};

impl Board {
    pub(super) fn stage_timeline(
        &self,
        card: &Card,
        runs: &[StageRun],
        cx: &mut Context<Self>,
    ) -> AnyElement {
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
        let now = chrono::Utc::now().timestamp_millis();
        let intervals: Vec<_> = runs
            .iter()
            .map(|run| (run.started_at, run.completed_at))
            .collect();
        let layout = layout::calculate(&intervals, now);
        let overall = super::super::kanban::status::status(card)
            .map(|(_, label)| label)
            .unwrap_or_else(|| {
                COLUMNS
                    .iter()
                    .find(|(id, _)| *id == card.column_id)
                    .map_or(card.column_id.as_str(), |(_, label)| *label)
            });
        timeline = timeline
            .child(div().text_size(px(12.)).child(overall.to_owned()))
            .child(
                div()
                    .text_size(px(12.))
                    .child(format!("Total elapsed {}", elapsed::label(layout.elapsed))),
            )
            .child(
                div()
                    .flex()
                    .justify_between()
                    .pl(px(38.))
                    .pr(px(112.))
                    .text_size(px(10.))
                    .text_color(content(0.5))
                    .child("0m")
                    .child(elapsed::label(layout.domain)),
            );
        for (position, lane) in layout.lanes.iter().enumerate() {
            let run = &runs[lane.index];
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
                CANCELLED => ("Cancelled", content(0.6)),
                INTERRUPTED => ("Interrupted", look::amber(1.)),
                RUNNING => ("Running", accent_color()),
                _ => (run.status.as_str(), content(0.5)),
            };
            let elapsed = Some(elapsed::label(lane.elapsed));
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
                            .child(
                                div()
                                    .id(gpui::SharedString::from(format!(
                                        "board-run-bar-{}",
                                        run.id
                                    )))
                                    .when_some(run.session_id.clone(), |d, session| {
                                        d.cursor_pointer().on_click(cx.listener(
                                            move |_, _, _, cx| {
                                                cx.emit(Event::OpenSession(session.clone()))
                                            },
                                        ))
                                    })
                                    .relative()
                                    .h(px(12.))
                                    .w_full()
                                    .bg(content(0.04))
                                    .child(
                                        div()
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

#[cfg(test)]
#[path = "tests/model.rs"]
mod model_tests;
