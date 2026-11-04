use crate::{editor_scrollbar::Metrics, popover::AnchorSlot, task_board::Board, theme::content};
use gpui::{
    AnyElement, Bounds, Context, MouseButton, Pixels, canvas, div, point, prelude::*, px, size,
};

const TRACK_HEIGHT: f32 = 12.;

#[derive(Default)]
pub(in crate::task_board) struct Bar {
    bounds: AnchorSlot,
    drag: Option<f32>,
}

impl Board {
    fn scroll_metrics(&self, bounds: Bounds<Pixels>) -> Metrics {
        let width = f32::from(bounds.size.width);
        Metrics::new(
            -f32::from(self.scroll.offset().x),
            width + f32::from(self.scroll.max_offset().x),
            width,
            width,
        )
    }

    pub(in crate::task_board) fn drag_board_scrollbar(
        &mut self,
        x: Pixels,
        cx: &mut Context<Self>,
    ) {
        let Some(bounds) = self.board_bar.bounds.get() else {
            return;
        };
        let Some(offset) = self.board_bar.drag else {
            return;
        };
        let metrics = self.scroll_metrics(bounds);
        let next = metrics.scroll_from_pointer(f32::from(x - bounds.left()), offset);
        self.scroll
            .set_offset(point(px(-next), self.scroll.offset().y));
        cx.notify();
    }

    pub(in crate::task_board) fn end_board_scrollbar(&mut self, cx: &mut Context<Self>) {
        if self.board_bar.drag.take().is_some() {
            cx.notify();
        }
    }

    pub(super) fn board_scrollbar(&self, cx: &mut Context<Self>) -> AnyElement {
        let scroll = self.scroll.clone();
        div()
            .id("board-horizontal-scrollbar")
            .debug_selector(|| "board-horizontal-scrollbar".into())
            .h(px(TRACK_HEIGHT))
            .w_full()
            .flex_shrink_0()
            .relative()
            .cursor_pointer()
            .child(self.board_bar.bounds.probe())
            .child(
                canvas(
                    |bounds, _, _| bounds,
                    move |bounds, _, window, _| {
                        let width = f32::from(bounds.size.width);
                        let metrics = Metrics::new(
                            -f32::from(scroll.offset().x),
                            width + f32::from(scroll.max_offset().x),
                            width,
                            width,
                        );
                        if metrics.scrollable {
                            window.paint_quad(
                                gpui::fill(
                                    Bounds::new(
                                        bounds.origin + point(px(metrics.thumb_top), px(3.)),
                                        size(px(metrics.thumb_height), px(TRACK_HEIGHT - 6.)),
                                    ),
                                    content(0.24),
                                )
                                .corner_radii(px(3.)),
                            );
                        }
                    },
                )
                .size_full(),
            )
            .on_mouse_down(
                MouseButton::Left,
                cx.listener(|this, event: &gpui::MouseDownEvent, _, cx| {
                    let Some(bounds) = this.board_bar.bounds.get() else {
                        return;
                    };
                    let metrics = this.scroll_metrics(bounds);
                    let position = f32::from(event.position.x - bounds.left());
                    let in_thumb = position >= metrics.thumb_top
                        && position <= metrics.thumb_top + metrics.thumb_height;
                    this.board_bar.drag = Some(if in_thumb {
                        position - metrics.thumb_top
                    } else {
                        metrics.thumb_height / 2.
                    });
                    this.drag_board_scrollbar(event.position.x, cx);
                    cx.stop_propagation();
                }),
            )
            .into_any_element()
    }
}
