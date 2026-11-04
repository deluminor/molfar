use super::look::{DRAWER_SHIFT, DRAWER_SLIDE, DRAWER_WIDTH};
use crate::task_board::Board;
use crate::theme::*;
use gpui::{Animation, AnimationExt, AnyElement, Context, Role, div, prelude::*, px};

fn ease_out(t: f32) -> f32 {
    1. - (1. - t).powi(3)
}

impl Board {
    /// Card details slide over the columns from the right; the board keeps its width.
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
            .absolute()
            .top_0()
            .bottom_0()
            .right_0()
            .w(px(DRAWER_WIDTH))
            .max_w_full()
            .flex()
            .flex_col()
            .bg(floating_fill())
            .text_color(content(1.))
            .border_l_1()
            .border_color(content(0.1))
            .shadow_lg()
            .child(
                div()
                    .flex_shrink_0()
                    .flex()
                    .items_center()
                    .gap_2()
                    .border_b_1()
                    .border_color(content(0.08))
                    .px_3()
                    .h(px(44.))
                    .child(
                        div()
                            .text_size(px(12.))
                            .text_color(content(0.55))
                            .child(format!("#{}", card.number)),
                    )
                    .child(
                        div()
                            .flex_1()
                            .min_w_0()
                            .truncate()
                            .text_size(px(13.))
                            .child(card.title.clone()),
                    )
                    .when(metadata_ready, |d| {
                        d.children(self.edit_action(card, self.stage_pending.is_some(), cx))
                    })
                    .child(
                        icon_button("board-detail-close", "Close details (Esc)", "x")
                            .debug_selector(|| "board-detail-close".into())
                            .on_click(cx.listener(|this, _, _, cx| this.close_detail(cx))),
                    ),
            )
            .child(div().flex_1().min_h_0().flex().child(self.detail(cx)))
            .when(metadata_ready, |d| {
                d.child(
                    div()
                        .id("board-detail-actions")
                        .debug_selector(|| "board-detail-actions".into())
                        .max_h(px(180.))
                        .overflow_y_scroll()
                        .flex_shrink_0()
                        .p_3()
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
                    |d, t| d.right(px(-DRAWER_SHIFT * (1. - t))),
                )
                .into_any_element(),
        )
    }
}
