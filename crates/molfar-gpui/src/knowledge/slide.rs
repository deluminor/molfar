//! The file tree and the note panel slide open and shut, pushing the graph
//! aside. Each side watches its own open flag, so every way of opening or
//! closing it animates the same.
use gpui::Window;
use std::time::{Duration, Instant};

const SLIDE: Duration = Duration::from_millis(260);

fn ease(t: f32) -> f32 {
    1. - (1. - t.clamp(0., 1.)).powi(3)
}

#[derive(Clone, Copy, Debug)]
struct Motion {
    from: f32,
    started: Instant,
}

#[derive(Clone, Copy, Debug)]
pub(crate) struct Reveal {
    open: bool,
    motion: Option<Motion>,
}

impl Reveal {
    pub(crate) fn new(open: bool) -> Self {
        Self { open, motion: None }
    }

    fn value(&self, now: Instant) -> f32 {
        let target = if self.open { 1. } else { 0. };
        let Some(motion) = self.motion else {
            return target;
        };
        let t = ease(now.duration_since(motion.started).as_secs_f32() / SLIDE.as_secs_f32());
        motion.from + (target - motion.from) * t
    }

    /// How far open to draw this frame, 0 to 1. A change of `open` starts a
    /// slide from wherever the last one stood; `animate` false snaps.
    pub(crate) fn step(&mut self, open: bool, animate: bool, window: &mut Window) -> f32 {
        let now = Instant::now();
        if open != self.open {
            let from = self.value(now);
            self.open = open;
            self.motion = animate.then_some(Motion { from, started: now });
        }
        let value = self.value(now);
        match self.motion {
            Some(motion) if now.duration_since(motion.started) < SLIDE => {
                window.request_animation_frame()
            }
            Some(_) => self.motion = None,
            None => {}
        }
        value
    }
}

#[cfg(test)]
mod tests {
    use super::ease;

    #[test]
    fn the_slide_eases_out_and_clamps() {
        assert_eq!(ease(0.), 0.);
        assert_eq!(ease(1.), 1.);
        assert_eq!(ease(2.), 1.);
        assert!(ease(0.5) > 0.5, "fast start, gentle stop");
    }
}
