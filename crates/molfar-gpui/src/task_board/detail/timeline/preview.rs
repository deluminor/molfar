use super::{Timeline, elapsed, layout, status};
use crate::task_board::controls;
use gpui::{AnyElement, Context, div, prelude::*, px};

impl Timeline {
    pub(super) fn preview(&self, cx: &mut Context<Self>) -> AnyElement {
        if self.runs.is_empty() {
            return div().into_any_element();
        }
        let intervals: Vec<_> = self
            .runs
            .iter()
            .map(|run| (run.started_at, run.completed_at))
            .collect();
        let layout = layout::calculate(&intervals, self.now);
        let total = if layout.lanes.iter().any(|lane| lane.available) {
            elapsed::label(layout.elapsed)
        } else {
            "Timing unavailable".into()
        };
        let mut tracks = div()
            .id("board-timeline-preview-tracks")
            .max_h(px(144.))
            .overflow_y_scroll()
            .flex()
            .flex_col()
            .gap_1();
        for lane in layout.lanes {
            let tone = status::presentation(&self.runs[lane.index].status).1;
            if !lane.available {
                tracks = tracks.child(div().text_size(px(10.)).child("Timing unavailable"));
                continue;
            }
            tracks = tracks.child(
                div().relative().h(px(6.)).flex_shrink_0().child(
                    div()
                        .id(gpui::SharedString::from(format!(
                            "board-preview-mark-{}",
                            self.runs[lane.index].id
                        )))
                        .debug_selector({
                            let id = self.runs[lane.index].id.clone();
                            move || format!("board-preview-mark-{id}")
                        })
                        .absolute()
                        .left(gpui::relative(lane.start))
                        .w(gpui::relative(lane.width))
                        .min_w(px(2.))
                        .h_full()
                        .rounded_sm()
                        .bg(tone)
                        .when(!lane.available, |d| d.opacity(0.)),
                ),
            );
        }
        div()
            .id("board-timeline-preview")
            .debug_selector(|| "board-timeline-preview".into())
            .min_w_0()
            .mb_3()
            .flex()
            .flex_col()
            .gap_2()
            .child(
                div()
                    .flex()
                    .flex_wrap()
                    .items_center()
                    .gap_2()
                    .child(
                        div()
                            .flex_1()
                            .text_size(px(12.))
                            .child(format!("Stage timeline · {}", total)),
                    )
                    .child(
                        controls::ghost_button("board-timeline-expand", "Expand timeline")
                            .debug_selector(|| "board-timeline-expand".into())
                            .track_focus(self.expand_focus.as_ref().expect("timeline focus"))
                            .tab_index(0)
                            .on_click(
                                cx.listener(|this, _, window, cx| this.open_dialog(window, cx)),
                            )
                            .on_key_down(cx.listener(
                                |this, event: &gpui::KeyDownEvent, window, cx| {
                                    if matches!(event.keystroke.key.as_str(), "enter" | "space") {
                                        this.open_dialog(window, cx);
                                        cx.stop_propagation();
                                    }
                                },
                            )),
                    ),
            )
            .child(tracks)
            .into_any_element()
    }
}
