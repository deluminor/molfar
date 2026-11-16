use super::{Timeline, elapsed, status};
use crate::{task_board::controls, theme::*};
use gpui::{AnyElement, Context, SharedString, Window, div, prelude::*, px};
use molfar_core::task_board::{constants::COLUMNS, types::StageRun};

fn local_time(timestamp: i64) -> String {
    chrono::DateTime::from_timestamp_millis(timestamp)
        .map(|time| {
            time.with_timezone(&chrono::Local)
                .format("%Y-%m-%d %H:%M:%S %Z (%:z)")
                .to_string()
        })
        .unwrap_or_else(|| "Timestamp unavailable".into())
}

impl Timeline {
    pub(super) fn inspect_button(&self, run: &StageRun, cx: &mut Context<Self>) -> AnyElement {
        let id = run.id.clone();
        let selected = id.clone();
        let keyed = id.clone();
        controls::ghost_button(
            SharedString::from(format!("modal-run-inspect-{id}")),
            "Inspect",
        )
        .debug_selector(move || format!("modal-run-inspect-{id}"))
        .aria_label(format!("Inspect {} attempt {}", run.stage, run.attempt))
        .track_focus(&self.inspect_focus[&run.id])
        .tab_index(0)
        .on_hover(cx.listener(move |this, hovered: &bool, _, cx| {
            this.hovered_run = hovered.then(|| selected.clone());
            cx.notify();
        }))
        .on_click({
            let id = run.id.clone();
            cx.listener(move |this, _, _, cx| {
                this.selected_run = Some(id.clone());
                cx.notify();
            })
        })
        .on_key_down(cx.listener(move |this, event: &gpui::KeyDownEvent, _, cx| {
            if matches!(event.keystroke.key.as_str(), "enter" | "space") {
                this.selected_run = Some(keyed.clone());
                cx.notify();
                cx.stop_propagation();
            }
        }))
        .into_any_element()
    }

    pub(super) fn inspection_panels(&self, window: &Window) -> AnyElement {
        let focused = self
            .runs
            .iter()
            .find(|run| {
                self.inspect_focus
                    .get(&run.id)
                    .is_some_and(|handle| handle.is_focused(window))
            })
            .map(|run| &run.id);
        let inspected = self.hovered_run.as_ref().or(focused);
        let mut panels = div().flex().flex_col().min_h_0();
        for (id, selector, title) in [
            (inspected, "board-timeline-inspection", "Inspection"),
            (
                self.selected_run.as_ref(),
                "board-timeline-selected",
                "Selected run",
            ),
        ] {
            let Some(run) = id.and_then(|id| self.runs.iter().find(|run| &run.id == id)) else {
                continue;
            };
            let stage = COLUMNS
                .iter()
                .find(|(key, _)| *key == run.stage)
                .map_or(run.stage.as_str(), |(_, label)| *label);
            let interval = run.completed_at.unwrap_or(self.now) as i128 - run.started_at as i128;
            let duration = if interval >= 0 {
                elapsed::label(interval)
            } else {
                "Timing unavailable".into()
            };
            panels = panels.child(
                div()
                    .id(selector)
                    .debug_selector(move || selector.into())
                    .flex_shrink_0()
                    .p_3()
                    .border_t_1()
                    .border_color(content(0.1))
                    .text_size(px(11.))
                    .flex()
                    .flex_col()
                    .gap_1()
                    .child(format!(
                        "{title}: {stage} · attempt {} · {} · {duration}",
                        run.attempt,
                        status::presentation(&run.status).0
                    ))
                    .child(format!(
                        "{} · {}",
                        run.harness,
                        controls::model_label(&run.harness, &run.model)
                    ))
                    .child(format!("Started: {}", local_time(run.started_at)))
                    .child(format!(
                        "Completed: {}",
                        run.completed_at
                            .map(local_time)
                            .unwrap_or_else(|| "Completion time unavailable".into())
                    ))
                    .children(run.error.clone().map(|error| div().child(error))),
            );
        }
        panels.into_any_element()
    }
}
