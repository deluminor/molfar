use super::{Timeline, elapsed, layout};
use crate::theme::*;
use gpui::{AnyElement, Context, div, prelude::*, px};
use molfar_core::task_board::constants::COLUMNS;

impl Timeline {
    pub(super) fn view(&self, cx: &mut Context<Self>) -> AnyElement {
        let runs = &self.runs;
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
        let Some(card) = &self.card else {
            return timeline.into_any_element();
        };
        let now = self.now;
        let intervals: Vec<_> = runs
            .iter()
            .map(|run| (run.started_at, run.completed_at))
            .collect();
        let layout = layout::calculate(&intervals, now);
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
            .child(
                div()
                    .text_size(px(12.))
                    .child(format!("Total elapsed {}", elapsed::label(layout.elapsed))),
            )
            .child(
                div()
                    .id("board-timeline-axis")
                    .debug_selector(|| "board-timeline-axis".into())
                    .flex()
                    .justify_between()
                    .pl(px(38.))
                    .pr(px(112.))
                    .text_size(px(10.))
                    .text_color(content(0.5))
                    .child(elapsed::label(0))
                    .child(elapsed::label(layout.domain)),
            );
        for (position, lane) in layout.lanes.iter().enumerate() {
            timeline =
                timeline.child(self.lane(&runs[lane.index], lane, position + 1 == runs.len(), cx));
        }
        timeline.into_any_element()
    }
}
