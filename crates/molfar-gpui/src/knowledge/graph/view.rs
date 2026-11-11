use super::{GraphView, SPIN, TRANSITION, frame::Scene, paint::graph_canvas};
use crate::pulse;
use gpui::{Context, Render, Role, Window, div, prelude::*};
use molfar_core::knowledge::Camera;
use std::time::Instant;

impl GraphView {
    /// Advances transitions, zoom easing and idle spin. Returns whether
    /// another frame is needed.
    fn advance(
        &mut self,
        now: Instant,
        size: (f32, f32),
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let elapsed = self
            .last_frame
            .map(|last| now.duration_since(last).as_secs_f32().min(0.1))
            .unwrap_or(0.);
        self.last_frame = Some(now);

        if size.1 > 0. && self.last_size.1 > 0. && size != self.last_size {
            self.fit_pending = true;
        }
        self.last_size = size;
        if self.fit_pending && !self.positions.is_empty() && size.1 > 0. {
            self.target_distance = Camera::fit_distance(&self.positions, size.0, size.1);
            self.fit_pending = false;
        }
        if self
            .transition
            .is_some_and(|started| now.duration_since(started) >= TRANSITION)
        {
            self.transition = None;
        }

        let target = super::emphasis::targets(&self.shown, self.selected_index(), self.hovered);
        let fading = self.levels != target;

        let idle = self.hovered.is_none() && self.drag.is_none();
        let spin = self.spinning && idle && !self.positions.is_empty();
        let zooming = (self.camera.distance - self.target_distance).abs() > 0.5;
        let simulating = self.simulating();
        let busy = spin
            || zooming
            || simulating
            || fading
            || self.transition.is_some()
            || self.pending.is_some();
        if !busy {
            self.last_frame = None;
            return;
        }
        if simulating {
            self.step_simulation();
        }

        let animate = pulse::request(pulse::Rate::Smooth, window, cx);
        // The shared 30Hz clock steps visibly on a slow spin; while the app is
        // in front, follow the display's own frame rate instead.
        if animate && pulse::app_active(cx) {
            window.request_animation_frame();
        }
        if fading {
            if animate {
                self.levels.ease(&target, 1. - (-elapsed * 10.).exp());
            } else {
                self.levels = target;
            }
        }
        if animate {
            if spin {
                self.camera.orbit(elapsed * SPIN, 0.);
            }
            let blend = 1. - (-elapsed * 9.).exp();
            self.camera.distance += (self.target_distance - self.camera.distance) * blend;
        } else {
            self.transition = None;
            self.camera.distance = self.target_distance;
            self.last_frame = None;
        }
    }
}

impl Render for GraphView {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let now = Instant::now();
        let area = self.bounds.get().size;
        let size = (f32::from(area.width), f32::from(area.height));
        self.advance(now, size, window, cx);

        let positions = self.current_positions(now);
        let selected = self.selected_index();
        let frame = Scene {
            projection: &self.shown,
            positions: &positions,
            camera: self.camera,
            size,
            levels: &self.levels,
        }
        .frame();
        self.projected = frame.projected.clone();
        self.radii = frame.radii.clone();
        let labels = self.labels(&frame, selected);

        let surface = div()
            .id("knowledge-graph-surface")
            .absolute()
            .inset_0()
            .child(graph_canvas(frame, self.bounds.clone()))
            .children(labels);

        // Overlays are siblings of the surface: they occlude its hitbox, so
        // pressing a control never orbits or picks the node beneath it.
        div()
            .id("knowledge-graph")
            .debug_selector(|| "knowledge-graph".into())
            .role(Role::Application)
            .aria_label("Knowledge graph")
            .relative()
            .size_full()
            .overflow_hidden()
            .child(self.listen(surface, cx))
            .child(self.controls(cx))
            .child(self.hint())
            .children(self.loader())
    }
}
