use std::time::{Duration, Instant};

pub(crate) const DURATION: Duration = Duration::from_millis(160);
const BUCKETS: usize = 31;

#[derive(Clone)]
pub(crate) struct Hover {
    active: Option<usize>,
    from: [f32; BUCKETS],
    changed: Instant,
    generation: u32,
}

impl Default for Hover {
    fn default() -> Self {
        Self {
            active: None,
            from: [0.; BUCKETS],
            changed: Instant::now(),
            generation: 0,
        }
    }
}

impl Hover {
    pub(crate) fn from(&self, index: usize) -> f32 {
        self.from[index]
    }
    pub(crate) fn target(&self, index: usize) -> f32 {
        if self.active == Some(index) { 1. } else { 0. }
    }
    pub(crate) fn generation(&self) -> u32 {
        self.generation
    }

    pub(crate) fn set(&mut self, index: usize, active: bool, reduced: bool) {
        let next = if active {
            Some(index)
        } else if self.active == Some(index) {
            None
        } else {
            self.active
        };
        if self.active == next {
            return;
        }
        let now = Instant::now();
        let t = if reduced {
            1.
        } else {
            (now.duration_since(self.changed).as_secs_f32() / DURATION.as_secs_f32()).min(1.)
        };
        let progress = crate::home::motion::ease_out(t);
        for bucket in 0..BUCKETS {
            self.from[bucket] += (self.target(bucket) - self.from[bucket]) * progress;
        }
        self.active = next;
        self.changed = now;
        self.generation = self.generation.wrapping_add(1);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn hover_moves_exits_and_ignores_stale_exit() {
        let mut hover = Hover::default();
        hover.set(0, true, true);
        assert_eq!(hover.target(0), 1.);
        hover.set(1, true, true);
        assert_eq!(hover.from(0), 1.);
        assert_eq!(hover.target(0), 0.);
        hover.set(0, false, true);
        assert_eq!(hover.target(1), 1.);
        hover.set(1, false, true);
        assert_eq!(hover.target(1), 0.);
    }
}
