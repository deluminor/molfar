//! Drag orbits, the wheel zooms, hovering names a note and a click without
//! a drag selects it.
use super::{Drag, GraphEvent, GraphView};
use gpui::{
    Context, Div, MouseButton, MouseDownEvent, MouseMoveEvent, MouseUpEvent, Pixels, Point,
    ScrollWheelEvent, Stateful, prelude::*, px,
};
use molfar_core::knowledge::{MAX_DISTANCE, MIN_DISTANCE, pick};

const ORBIT_PER_PIXEL: f32 = 0.006;
const CLICK_TRAVEL: f32 = 4.;
const ZOOM_PER_PIXEL: f32 = 0.0018;

impl GraphView {
    fn hit(&self, position: Point<Pixels>) -> Option<usize> {
        let origin = self.bounds.get().origin;
        let local = position - origin;
        pick(
            &self.projected,
            &self.radii,
            f32::from(local.x),
            f32::from(local.y),
        )
    }

    fn hover(&mut self, position: Point<Pixels>, cx: &mut Context<Self>) {
        let hovered = self.hit(position);
        if hovered != self.hovered {
            self.hovered = hovered;
            cx.notify();
        }
    }

    pub(super) fn listen(&self, surface: Stateful<Div>, cx: &mut Context<Self>) -> Stateful<Div> {
        surface
            .when(self.hovered.is_some(), |surface| surface.cursor_pointer())
            .when(self.drag.is_some(), |surface| surface.cursor_grabbing())
            .on_mouse_down(
                MouseButton::Left,
                cx.listener(|this, event: &MouseDownEvent, _, cx| {
                    this.drag = Some(Drag {
                        last: event.position,
                        travel: 0.,
                    });
                    cx.notify();
                }),
            )
            .on_mouse_move(cx.listener(|this, event: &MouseMoveEvent, _, cx| {
                let pressed = event.pressed_button == Some(MouseButton::Left);
                let Some(drag) = this.drag.as_mut().filter(|_| pressed) else {
                    this.drag = None;
                    this.hover(event.position, cx);
                    return;
                };
                let delta = event.position - drag.last;
                drag.last = event.position;
                let (dx, dy) = (f32::from(delta.x), f32::from(delta.y));
                drag.travel += dx.abs() + dy.abs();
                this.camera
                    .orbit(-dx * ORBIT_PER_PIXEL, dy * ORBIT_PER_PIXEL);
                cx.notify();
            }))
            .on_mouse_up(
                MouseButton::Left,
                cx.listener(|this, event: &MouseUpEvent, _, cx| {
                    let click = this
                        .drag
                        .take()
                        .is_some_and(|drag| drag.travel < CLICK_TRAVEL);
                    if click
                        && let Some(index) = this.hit(event.position)
                        && let Some(node) = this.shown.nodes.get(index)
                    {
                        let path = node.path.clone();
                        this.selected = Some(path.clone());
                        cx.emit(GraphEvent::Select(path));
                    }
                    cx.notify();
                }),
            )
            .on_mouse_up_out(
                MouseButton::Left,
                cx.listener(|this, _: &MouseUpEvent, _, cx| {
                    this.drag = None;
                    cx.notify();
                }),
            )
            .on_hover(cx.listener(|this, hovered: &bool, _, cx| {
                if !*hovered && this.hovered.take().is_some() {
                    cx.notify();
                }
            }))
            .on_scroll_wheel(cx.listener(|this, event: &ScrollWheelEvent, _, cx| {
                let delta = f32::from(event.delta.pixel_delta(px(16.)).y);
                this.target_distance = (this.target_distance * (-delta * ZOOM_PER_PIXEL).exp())
                    .clamp(MIN_DISTANCE, MAX_DISTANCE);
                cx.stop_propagation();
                cx.notify();
            }))
    }
}
