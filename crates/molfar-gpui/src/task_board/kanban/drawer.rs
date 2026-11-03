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
        let selected = self.selected.clone()?;
        let snapshot = self.snapshot.as_ref()?;
        snapshot.cards.iter().find(|card| card.id == selected)?;

        let drawer = div()
            .id("board-detail-drawer")
            .debug_selector(|| "board-detail-drawer".into())
            .role(Role::Dialog)
            .aria_label("Card details")
            .absolute()
            .top_0()
            .bottom_0()
            .right_0()
            .w(px(DRAWER_WIDTH))
            .max_w_full()
            .flex()
            .flex_col()
            .bg(pane_fill())
            .border_l_1()
            .border_color(content(0.1))
            .shadow_lg()
            .child(
                div()
                    .flex_shrink_0()
                    .flex()
                    .justify_end()
                    .px_2()
                    .pt_2()
                    .child(
                        icon_button("board-detail-close", "Close details (Esc)", "x")
                            .debug_selector(|| "board-detail-close".into())
                            .on_click(cx.listener(|this, _, _, cx| this.close_detail(cx))),
                    ),
            )
            .child(div().flex_1().min_h_0().flex().child(self.detail(cx)));

        if cx.reduce_motion() {
            return Some(drawer.into_any_element());
        }
        Some(
            drawer
                .with_animation(
                    ("board-detail-drawer", self.drawer_opens),
                    Animation::new(DRAWER_SLIDE).with_easing(ease_out),
                    |d, t| d.right(px(-DRAWER_SHIFT * (1. - t))).opacity(t),
                )
                .into_any_element(),
        )
    }
}
