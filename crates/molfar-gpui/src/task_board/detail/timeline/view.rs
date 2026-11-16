use super::{Timeline, elapsed, layout};
use crate::theme::*;
use gpui::{AnyElement, Context, div, prelude::*, px};
use molfar_core::task_board::constants::COLUMNS;

impl Timeline {
    pub(super) fn view(&self, modal: bool, cx: &mut Context<Self>) -> AnyElement {
        let runs = &self.runs;
        let mut timeline = div()
            .id(if modal {
                "modal-timeline-history"
            } else {
                "board-timeline-history"
            })
            .debug_selector(move || {
                if modal {
                    "modal-timeline-history".into()
                } else {
                    "board-timeline-history".into()
                }
            })
            .flex()
            .flex_col()
            .flex_shrink_0()
            .when(modal, |d| {
                d.h_full()
                    .min_h_0()
                    .overflow_y_scroll()
                    .track_scroll(self.chart_scroll.as_ref().expect("chart scroll"))
            });
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
        let Some(card) = &self.card else {
            return timeline.into_any_element();
        };
        let now = self.now;
        let intervals: Vec<_> = runs
            .iter()
            .map(|run| (run.started_at, run.completed_at))
            .collect();
        let mut layout = layout::calculate(&intervals, now);
        if !modal {
            layout.lanes.sort_by_key(|lane| lane.index);
            for (position, lane) in layout.lanes.iter().enumerate() {
                timeline = timeline.child(self.lane(
                    &runs[lane.index],
                    lane,
                    position + 1 == runs.len(),
                    false,
                    cx,
                ));
            }
            return timeline.into_any_element();
        }
        let overall = super::super::super::kanban::status::status(card)
            .map(|(_, label)| label)
            .unwrap_or_else(|| {
                COLUMNS
                    .iter()
                    .find(|(id, _)| *id == card.column_id)
                    .map_or(card.column_id.as_str(), |(_, label)| *label)
            });
        timeline = timeline
            .child(div().text_size(px(12.)).child(overall.to_owned()))
            .child(div().text_size(px(12.)).child(format!(
                "Total elapsed {}",
                if layout.lanes.iter().any(|lane| lane.available) {
                    elapsed::label(layout.elapsed)
                } else {
                    "Timing unavailable".into()
                }
            )))
            .children(layout.lanes.iter().any(|lane| lane.available).then(|| {
                div()
                    .id("modal-timeline-axis")
                    .debug_selector(|| "modal-timeline-axis".into())
                    .flex()
                    .justify_between()
                    .pl(px(38.))
                    .pr(px(if modal { 182. } else { 112. }))
                    .text_size(px(10.))
                    .text_color(content(0.5))
                    .child(elapsed::label(0))
                    .child(elapsed::label(layout.domain))
                    .into_any_element()
            }));
        for (position, lane) in layout.lanes.iter().enumerate() {
            timeline = timeline.child(self.lane(
                &runs[lane.index],
                lane,
                position + 1 == runs.len(),
                modal,
                cx,
            ));
        }
        timeline.into_any_element()
    }
}
