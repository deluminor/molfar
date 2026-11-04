use super::{
    Home, card,
    drag::Gesture,
    layout::{
        geometry::{Grid, Rect},
        model::{Item, WidgetId},
    },
    motion,
};
use crate::theme::*;
use gpui::{
    Animation, AnimationExt, AnyElement, BoxShadow, Context, MouseButton, MouseDownEvent,
    SharedString, Window, div, point, prelude::*, px,
};

const HANDLE: f32 = 14.;
const HIDE_CONTROL_ROOM: f32 = 30.;

impl Home {
    pub(super) fn grid(
        &mut self,
        items: &[Item],
        width: f32,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let grid = Grid::new(width.max(1.));
        self.grid = Some(grid);
        let now = cx.background_executor().now();
        let animate = !cx.reduce_motion();
        let dragging = self.drag.as_ref().map(|drag| drag.id);
        let shown = self
            .drag
            .as_ref()
            .map_or_else(|| items.to_vec(), |drag| drag.preview.clone());

        let mut height = grid.height(&shown);
        if let Some(drag) = &self.drag {
            height = height.max(drag.frame.y + drag.frame.h);
        }
        let mut canvas = div()
            .id("home-grid")
            .debug_selector(|| "home-grid".into())
            .relative()
            .w_full()
            .h(px(height))
            .child(self.frame.layout_probe());

        if let Some(drag) = &self.drag
            && let Some(target) = drag.preview.iter().find(|item| item.id == drag.id)
        {
            canvas = canvas.child(placeholder(grid.rect(target)));
        }

        let mut moving = false;
        let mut floating = None;
        for (index, item) in shown.iter().enumerate() {
            let body = self.widget(item.id, window, cx);
            let framed = card::card(item.id, self.editing, self.card_actions(item.id, cx), body);
            let handles = if self.editing {
                self.handles(item.id, cx)
            } else {
                Vec::new()
            };

            if Some(item.id) == dragging {
                let frame = self
                    .drag
                    .as_ref()
                    .map_or(grid.rect(item), |drag| drag.frame);
                floating = Some(lifted(item.id, frame, framed.children(handles)));
                continue;
            }

            let (rect, glides) = self.reflow.place(*item, &grid, now, animate);
            moving |= glides;
            let placed = positioned(item.id, rect).child(framed.children(handles));
            canvas = canvas.child(if animate {
                let entrance = self.entrance;
                placed
                    .with_animation(
                        ("home-entrance", entrance * 16 + index as u32),
                        Animation::new(motion::ENTRANCE),
                        move |placed, t| {
                            let t = motion::staggered(t, index);
                            placed.opacity(t).top(px(rect.y + motion::RISE * (1. - t)))
                        },
                    )
                    .into_any_element()
            } else {
                placed.into_any_element()
            });
        }

        if moving {
            window.request_animation_frame();
        }
        canvas.children(floating).into_any_element()
    }

    fn handles(&self, id: WidgetId, cx: &mut Context<Self>) -> Vec<AnyElement> {
        let key = id.key();
        let grip = div()
            .id(SharedString::from(format!("home-move-{key}")))
            .debug_selector(move || format!("home-move-{key}"))
            .absolute()
            .top_0()
            .left_0()
            .right(px(HIDE_CONTROL_ROOM))
            .h(px(card::CARD_PADDING + card::CAPTION_HEIGHT))
            .cursor_grab()
            .on_mouse_down(
                MouseButton::Left,
                cx.listener(move |this, event: &MouseDownEvent, _, cx| {
                    this.begin_drag(id, Gesture::Move, event.position, cx)
                }),
            );
        let corner = div()
            .id(SharedString::from(format!("home-resize-{key}")))
            .debug_selector(move || format!("home-resize-{key}"))
            .absolute()
            .right_0()
            .bottom_0()
            .size(px(HANDLE + 6.))
            .flex()
            .items_end()
            .justify_end()
            .p(px(3.))
            .cursor(gpui::CursorStyle::ResizeUpLeftDownRight)
            .child(
                div()
                    .size(px(HANDLE / 2.))
                    .border_r_2()
                    .border_b_2()
                    .rounded_br_sm()
                    .border_color(accent_color().opacity(0.6)),
            )
            .on_mouse_down(
                MouseButton::Left,
                cx.listener(move |this, event: &MouseDownEvent, _, cx| {
                    this.begin_drag(id, Gesture::Resize, event.position, cx)
                }),
            );
        vec![grip.into_any_element(), corner.into_any_element()]
    }
}

fn positioned(id: WidgetId, rect: Rect) -> gpui::Stateful<gpui::Div> {
    let key = id.key();
    div()
        .id(SharedString::from(format!("home-card-{key}")))
        .debug_selector(move || format!("home-card-{key}"))
        .absolute()
        .left(px(rect.x))
        .top(px(rect.y))
        .w(px(rect.w))
        .h(px(rect.h))
}

fn lifted(id: WidgetId, frame: Rect, card: impl IntoElement) -> AnyElement {
    positioned(id, frame)
        .cursor_grabbing()
        .opacity(0.94)
        .rounded_lg()
        .bg(floating_fill())
        .shadow(vec![BoxShadow {
            color: black(0.28),
            offset: point(px(0.), px(14.)),
            blur_radius: px(32.),
            spread_radius: px(-6.),
            inset: false,
        }])
        .child(card)
        .into_any_element()
}

fn placeholder(rect: Rect) -> impl IntoElement {
    div()
        .id("home-drop-target")
        .debug_selector(|| "home-drop-target".into())
        .absolute()
        .left(px(rect.x))
        .top(px(rect.y))
        .w(px(rect.w))
        .h(px(rect.h))
        .rounded_lg()
        .border_1()
        .border_dashed()
        .border_color(accent_color().opacity(0.5))
        .bg(accent_color().opacity(0.06))
}
