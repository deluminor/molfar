use super::{paint::extent, sphere, sphere_motion::Motion};
use crate::{home::layout::state::BrandVisual, pulse};
use gpui::{
    Context, MouseButton, MouseDownEvent, MouseMoveEvent, Render, Subscription, Window, canvas,
    div, prelude::*,
};
use std::{cell::RefCell, rc::Rc};

pub(crate) struct BrandView {
    pub visual: BrandVisual,
    pub motion: Rc<RefCell<Motion>>,
    activation: Option<Subscription>,
}

impl BrandView {
    pub(crate) fn new(visual: BrandVisual, motion: Rc<RefCell<Motion>>) -> Self {
        Self {
            visual,
            motion,
            activation: None,
        }
    }
}

impl Render for BrandView {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        if self.activation.is_none() {
            self.activation = Some(cx.observe_window_activation(window, |this, window, cx| {
                if !window.is_window_active() {
                    this.motion.borrow_mut().cancel();
                    cx.notify();
                }
            }));
        }
        let visual = self.visual;
        let motion = self.motion.clone();
        let entity = cx.entity().downgrade();
        div()
            .id("home-brand-visual")
            .debug_selector(move || format!("home-brand-{}", visual.key()))
            .size_full()
            .overflow_hidden()
            .when(!self.motion.borrow().editing, |view| {
                if self.motion.borrow().dragging() {
                    view.cursor_grabbing()
                } else {
                    view.cursor_grab()
                }
            })
            .on_mouse_down(
                MouseButton::Left,
                cx.listener(|this, event: &MouseDownEvent, _, cx| {
                    let now = pulse::elapsed(cx).as_secs_f32();
                    let position = (event.position.x.as_f32(), event.position.y.as_f32());
                    if this.motion.borrow_mut().press(position, now) {
                        cx.stop_propagation();
                        cx.notify();
                    }
                }),
            )
            .on_mouse_up(
                MouseButton::Left,
                cx.listener(|this, _, _, cx| {
                    let now = pulse::elapsed(cx).as_secs_f32();
                    let reduced = cx.reduce_motion();
                    if this.motion.borrow_mut().release(now, reduced) {
                        cx.stop_propagation();
                        cx.notify();
                    }
                }),
            )
            .on_mouse_up_out(
                MouseButton::Left,
                cx.listener(|this, _, _, cx| {
                    let now = pulse::elapsed(cx).as_secs_f32();
                    let reduced = cx.reduce_motion();
                    if this.motion.borrow_mut().release(now, reduced) {
                        cx.notify();
                    }
                }),
            )
            .child(
                canvas(
                    |_, _, _| (),
                    move |bounds, _, window, cx| {
                        if motion.borrow().dragging() {
                            let motion = motion.clone();
                            let entity = entity.clone();
                            window.on_mouse_event(move |event: &MouseMoveEvent, phase, _, cx| {
                                if !phase.capture() || !motion.borrow().dragging() {
                                    return;
                                }
                                let now = pulse::elapsed(cx).as_secs_f32();
                                if event.pressed_button == Some(MouseButton::Left) {
                                    motion.borrow_mut().moved(
                                        (event.position.x.as_f32(), event.position.y.as_f32()),
                                        now,
                                    );
                                } else {
                                    motion.borrow_mut().cancel();
                                }
                                let _ = entity.update(cx, |_, cx| cx.notify());
                                cx.stop_propagation();
                            });
                        }
                        let animated = motion.borrow().animate()
                            && pulse::request(pulse::Rate::Smooth, window, cx);
                        let elapsed = pulse::elapsed(cx).as_secs_f32();
                        let (orientation, time, heat, spin) = {
                            let mut motion = motion.borrow_mut();
                            let orientation = motion.frame(elapsed, !animated);
                            (
                                orientation,
                                motion.particle_time,
                                motion.heat(),
                                motion.spin(),
                            )
                        };
                        let (width, height) = extent(bounds);
                        window.with_content_mask(Some(gpui::ContentMask { bounds }), |window| {
                            sphere::paint(
                                bounds.origin,
                                width,
                                height,
                                time,
                                orientation,
                                heat,
                                spin,
                                window,
                            );
                        });
                    },
                )
                .size_full(),
            )
    }
}
