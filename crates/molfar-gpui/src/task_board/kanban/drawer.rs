use super::look::{DRAWER_SLIDE, DRAWER_WIDTH};
use crate::task_board::Board;
use crate::theme::*;
use gpui::{Animation, AnimationExt, AnyElement, Context, Role, div, prelude::*, px};

fn ease_out(t: f32) -> f32 {
    1. - (1. - t).powi(3)
}

impl Board {
    pub(super) fn detail_drawer(&self, cx: &mut Context<Self>) -> Option<AnyElement> {
        if !self.drawer_open {
            return None;
        }
        let selected = self.selected.clone()?;
        let snapshot = self.snapshot.as_ref()?;
        let card = snapshot.cards.iter().find(|card| card.id == selected)?;
        let metadata_ready = snapshot.selected.as_ref() == self.selected.as_ref();

        let drawer = div()
            .id("board-detail-drawer")
            .debug_selector(|| "board-detail-drawer".into())
            .role(Role::Dialog)
            .aria_label("Card details")
            .occlude()
            .relative()
            .h_full()
            .flex_shrink_0()
            .w(px(DRAWER_WIDTH))
            .max_w(gpui::relative(0.65))
            .flex()
            .flex_col()
            .bg(floating_fill())
            .text_color(content(1.))
            .border_l_1()
            .border_color(content(0.1))
            .child(self.detail_header(card, metadata_ready, cx))
            .child(self.detail_tabs(cx))
            .child(div().flex_1().min_h_0().flex().child(self.detail(cx)))
            .when(metadata_ready, |d| {
                d.child(
                    div()
                        .id("board-detail-actions")
                        .debug_selector(|| "board-detail-actions".into())
                        .max_h(px(220.))
                        .overflow_y_scroll()
                        .flex_shrink_0()
                        .px_4()
                        .py_3()
                        .border_t_1()
                        .border_color(content(0.08))
                        .child(self.stage_actions(card, cx)),
                )
            });

        if cx.reduce_motion() {
            return Some(drawer.into_any_element());
        }
        Some(
            drawer
                .with_animation(
                    ("board-detail-drawer", self.drawer_opens),
                    Animation::new(DRAWER_SLIDE).with_easing(ease_out),
                    |d, t| d.opacity(t),
                )
                .into_any_element(),
        )
    }
}
