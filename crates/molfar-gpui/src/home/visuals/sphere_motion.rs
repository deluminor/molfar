use std::f32::consts::TAU;

const SENSITIVITY: f32 = 0.008;
const MAX_SPEED: f32 = 8.;
const DAMPING: f32 = 3.8;
const MAX_FRAME: f32 = 0.15;
const PITCH_LIMIT: f32 = 1.25;
const HEAT_IN: f32 = 12.;
const HEAT_OUT: f32 = 1.15;
const HEAT_SPEED_MIN: f32 = 0.55;
const HEAT_SPEED_MAX: f32 = 3.2;

#[derive(Clone, Copy, Debug)]
struct Drag {
    position: (f32, f32),
    at: f32,
}

#[derive(Debug)]
pub(crate) struct Motion {
    pub yaw: f32,
    pub pitch: f32,
    pub editing: bool,
    pub particle_time: f32,
    velocity: (f32, f32),
    heat: f32,
    spin: (f32, f32),
    drag: Option<Drag>,
    frame_at: Option<f32>,
    paused: bool,
}

impl Default for Motion {
    fn default() -> Self {
        Self {
            yaw: 0.,
            pitch: 0.32,
            editing: false,
            particle_time: 1.,
            velocity: (0., 0.),
            heat: 0.,
            spin: (0., 0.),
            drag: None,
            frame_at: None,
            paused: false,
        }
    }
}

impl Motion {
    pub(crate) fn animate(&self) -> bool {
        !self.paused && !self.editing
    }

    pub(crate) fn dragging(&self) -> bool {
        self.drag.is_some()
    }

    pub(crate) fn heat(&self) -> f32 {
        self.heat
    }

    pub(crate) fn spin(&self) -> (f32, f32) {
        self.spin
    }

    pub(crate) fn set_editing(&mut self, editing: bool) {
        self.editing = editing;
        self.cancel();
    }

    pub(crate) fn pause(&mut self) {
        self.paused = true;
        self.cancel();
    }

    pub(crate) fn resume(&mut self) {
        self.paused = false;
        self.frame_at = None;
    }

    pub(crate) fn cancel(&mut self) {
        self.drag = None;
        self.velocity = (0., 0.);
        self.heat = 0.;
        self.spin = (0., 0.);
        self.frame_at = None;
    }

    pub(crate) fn press(&mut self, position: (f32, f32), now: f32) -> bool {
        if self.editing || self.paused {
            return false;
        }
        self.velocity = (0., 0.);
        self.drag = Some(Drag { position, at: now });
        true
    }

    pub(crate) fn moved(&mut self, position: (f32, f32), now: f32) -> bool {
        let Some(drag) = self.drag else {
            return false;
        };
        let yaw = -(position.0 - drag.position.0) * SENSITIVITY;
        let pitch = -(position.1 - drag.position.1) * SENSITIVITY;
        self.rotate(yaw, pitch);
        let dt = now - drag.at;
        self.velocity = if dt > MAX_FRAME || dt < 0. {
            (0., 0.)
        } else {
            let dt = dt.max(1. / 240.);
            (
                (yaw / dt).clamp(-MAX_SPEED, MAX_SPEED),
                (pitch / dt).clamp(-MAX_SPEED, MAX_SPEED),
            )
        };
        if self.pitch.abs() >= PITCH_LIMIT {
            self.velocity.1 = 0.;
        }
        self.drag = Some(Drag { position, at: now });
        true
    }

    pub(crate) fn release(&mut self, now: f32, reduced: bool) -> bool {
        let Some(drag) = self.drag.take() else {
            return false;
        };
        if reduced || now - drag.at > MAX_FRAME {
            self.velocity = (0., 0.);
        }
        self.frame_at = Some(now);
        true
    }

    pub(crate) fn frame(&mut self, now: f32, reduced: bool) -> (f32, f32) {
        let dt = self.frame_at.replace(now).map_or(0., |last| now - last);
        if reduced || dt > MAX_FRAME {
            self.velocity = (0., 0.);
        }
        if !reduced && !self.paused && !self.editing && (0. ..=MAX_FRAME).contains(&dt) {
            self.particle_time += dt;
        }
        if !reduced
            && !self.paused
            && !self.editing
            && self.drag.is_none()
            && (0. ..=MAX_FRAME).contains(&dt)
        {
            let decay = (-DAMPING * dt).exp();
            let integral = (1. - decay) / DAMPING;
            self.rotate(
                self.velocity.0 * integral + 0.12 * dt,
                self.velocity.1 * integral,
            );
            self.velocity.0 *= decay;
            self.velocity.1 *= decay;
        }
        self.settle_heat(dt, reduced);
        (self.yaw, self.pitch)
    }

    fn settle_heat(&mut self, dt: f32, reduced: bool) {
        if reduced || self.paused || self.editing || !(0. ..=MAX_FRAME).contains(&dt) {
            self.heat = 0.;
            self.spin = (0., 0.);
            return;
        }

        let speed = self.velocity.0.hypot(self.velocity.1);
        let target = heat_target(speed);
        let rate = if target > self.heat {
            HEAT_IN
        } else {
            HEAT_OUT
        };
        self.heat = approach(self.heat, target, rate, dt);
        if speed > HEAT_SPEED_MIN {
            let dir = (self.velocity.0 / speed, self.velocity.1 / speed);
            self.spin.0 = approach(self.spin.0, dir.0, 14., dt);
            self.spin.1 = approach(self.spin.1, dir.1, 14., dt);
        }
    }

    fn rotate(&mut self, yaw: f32, pitch: f32) {
        self.yaw = (self.yaw + yaw).rem_euclid(TAU);
        self.pitch = (self.pitch + pitch).clamp(-PITCH_LIMIT, PITCH_LIMIT);
        if self.pitch.abs() >= PITCH_LIMIT {
            self.velocity.1 = 0.;
        }
    }
}

fn approach(current: f32, target: f32, rate: f32, dt: f32) -> f32 {
    let alpha = 1. - (-rate * dt).exp();
    current + (target - current) * alpha
}

fn heat_target(speed: f32) -> f32 {
    let t = ((speed - HEAT_SPEED_MIN) / (HEAT_SPEED_MAX - HEAT_SPEED_MIN)).clamp(0., 1.);
    t * t * (3. - 2. * t)
}

#[cfg(test)]
#[path = "sphere_motion_tests.rs"]
mod tests;
