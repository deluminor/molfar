use std::f32::consts::TAU;

const SENSITIVITY: f32 = 0.008;
const MAX_SPEED: f32 = 8.;
const DAMPING: f32 = 3.8;
const MAX_FRAME: f32 = 0.15;
const PITCH_LIMIT: f32 = 1.25;

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
        (self.yaw, self.pitch)
    }

    fn rotate(&mut self, yaw: f32, pitch: f32) {
        self.yaw = (self.yaw + yaw).rem_euclid(TAU);
        self.pitch = (self.pitch + pitch).clamp(-PITCH_LIMIT, PITCH_LIMIT);
        if self.pitch.abs() >= PITCH_LIMIT {
            self.velocity.1 = 0.;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn thrown() -> Motion {
        let mut motion = Motion::default();
        motion.press((0., 0.), 0.);
        motion.moved((20., 10.), 0.05);
        motion.release(0.05, false);
        motion
    }

    #[test]
    fn drag_rotates_immediately_with_bounded_angles_and_speed() {
        let mut motion = Motion::default();
        motion.press((0., 0.), 0.);
        motion.moved((1000., 1000.), 0.001);
        assert!((0. ..TAU).contains(&motion.yaw));
        assert_eq!(motion.pitch, -PITCH_LIMIT);
        assert!(motion.velocity.0.abs() <= MAX_SPEED);
        motion.release(0.01, false);
        assert!(!motion.dragging());
    }

    #[test]
    fn inertia_is_frame_rate_independent_and_damps() {
        let mut a = thrown();
        let mut b = thrown();
        for step in 1..=30 {
            a.frame(0.05 + step as f32 / 30., false);
        }
        for step in 1..=60 {
            b.frame(0.05 + step as f32 / 60., false);
        }
        assert!((a.yaw - b.yaw).abs() < 0.0001);
        assert!((a.pitch - b.pitch).abs() < 0.0001);
        assert!(a.velocity.0.abs() < 0.1);
    }

    #[test]
    fn reduced_motion_allows_direct_drag_but_no_idle_or_inertia() {
        let mut motion = thrown();
        motion.release(0.06, true);
        let before = motion.frame(0.06, true);
        assert_eq!(motion.frame(0.1, true), before);
        assert!(motion.press((0., 0.), 0.1));
        motion.moved((10., 0.), 0.12);
        assert_ne!(motion.yaw, before.0);
        motion.release(0.12, true);
        let before = motion.frame(0.12, true);
        assert_eq!(motion.frame(0.14, true), before);
    }

    #[test]
    fn editing_hidden_gaps_and_stationary_release_do_not_spin() {
        let mut motion = thrown();
        motion.set_editing(true);
        assert!(!motion.animate());
        assert!(!motion.press((0., 0.), 0.1));
        motion.set_editing(false);
        motion.pause();
        assert!(!motion.press((0., 0.), 0.1));
        motion.resume();
        assert!(motion.animate());
        let particle_time = motion.particle_time;
        let before = (motion.yaw, motion.pitch);
        assert_eq!(motion.frame(500., false), before);
        assert_eq!(motion.particle_time, particle_time);
        motion.press((0., 0.), 500.);
        motion.moved((20., 0.), 500.05);
        motion.release(501., false);
        assert_eq!(motion.velocity, (0., 0.));
    }
}
