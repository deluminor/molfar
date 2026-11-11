//! Dragging empty space orbits, dragging a note pulls it and its links, the
//! wheel zooms, hovering names a note and a click without a drag selects it.
use super::{Drag, GraphEvent, GraphView};
use gpui::{
    Context, Div, MouseButton, MouseDownEvent, MouseMoveEvent, MouseUpEvent, Pixels, Point,
    ScrollWheelEvent, Stateful, prelude::*, px,
};
use molfar_core::knowledge::{DRAG_ALPHA, MAX_DISTANCE, MIN_DISTANCE, pick};

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

    fn press(&mut self, position: Point<Pixels>) {
        self.drag = Some(match self.hit(position) {
            Some(index) => Drag::Node {
                index,
                depth: self.projected[index].map_or(1., |item| item.depth),
                origin: position,
                target: None,
                travel: 0.,
            },
            None => Drag::Orbit {
                last: position,
                travel: 0.,
            },
        });
    }

    fn pull(&mut self, position: Point<Pixels>) {
        let bounds = self.bounds.get();
        let (width, height) = (f32::from(bounds.size.width), f32::from(bounds.size.height));
        let local = position - bounds.origin;
        let camera = self.camera;
        let Some(drag) = self.drag.as_mut() else {
            return;
        };
        match drag {
            Drag::Orbit { last, travel } => {
                let delta = position - *last;
                *last = position;
                let (dx, dy) = (f32::from(delta.x), f32::from(delta.y));
                *travel += dx.abs() + dy.abs();
                self.camera
                    .orbit(-dx * ORBIT_PER_PIXEL, dy * ORBIT_PER_PIXEL);
            }
            Drag::Node {
                index,
                depth,
                origin,
                target,
                travel,
            } => {
                let moved = position - *origin;
                *travel = travel.max(f32::from(moved.x).abs() + f32::from(moved.y).abs());
                if *travel < CLICK_TRAVEL {
                    return;
                }
                *target = Some(camera.unproject(
                    f32::from(local.x),
                    f32::from(local.y),
                    *depth,
                    width,
                    height,
                ));
                self.hovered = Some(*index);
                self.settle_transition();
                if let Some(simulation) = self.simulation.as_mut() {
                    simulation.reheat(DRAG_ALPHA);
                }
            }
        }
    }

    fn release(&mut self, position: Point<Pixels>, cx: &mut Context<Self>) {
        let Some(drag) = self.drag.take() else {
            return;
        };
        let picked = match drag {
            Drag::Node { index, .. } => Some(index),
            Drag::Orbit { .. } => self.hit(position),
        };
        if drag.travel() < CLICK_TRAVEL
            && let Some(node) = picked.and_then(|index| self.shown.nodes.get(index))
        {
            let path = node.path.clone();
            self.selected = Some(path.clone());
            cx.emit(GraphEvent::Select(path));
        }
    }

    pub(super) fn listen(&self, surface: Stateful<Div>, cx: &mut Context<Self>) -> Stateful<Div> {
        surface
            .when(self.hovered.is_some(), |surface| surface.cursor_pointer())
            .when(self.drag.is_some(), |surface| surface.cursor_grabbing())
            .on_mouse_down(
                MouseButton::Left,
                cx.listener(|this, event: &MouseDownEvent, _, cx| {
                    this.press(event.position);
                    cx.notify();
                }),
            )
            .on_mouse_move(cx.listener(|this, event: &MouseMoveEvent, _, cx| {
                if event.pressed_button != Some(MouseButton::Left) || this.drag.is_none() {
                    this.drag = None;
                    this.hover(event.position, cx);
                    return;
                }
                this.pull(event.position);
                cx.notify();
            }))
            .on_mouse_up(
                MouseButton::Left,
                cx.listener(|this, event: &MouseUpEvent, _, cx| {
                    this.release(event.position, cx);
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
