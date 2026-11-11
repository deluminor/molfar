//! The file tree slides open and shut, pushing the note and graph aside.
use super::Knowledge;
use gpui::{Context, Window};
use std::time::{Duration, Instant};

const SLIDE: Duration = Duration::from_millis(240);

fn ease(t: f32) -> f32 {
    1. - (1. - t.clamp(0., 1.)).powi(3)
}

#[derive(Clone, Copy, Debug)]
pub(crate) struct Slide {
    from: f32,
    started: Instant,
}

impl Knowledge {
    /// Opens or closes the tree with a slide, unless motion is reduced.
    pub(super) fn toggle_tree(&mut self, cx: &mut Context<Self>) {
        let from = self.tree_reveal(Instant::now());
        self.tree_open = !self.tree_open;
        self.tree_slide = (!cx.reduce_motion()).then(|| Slide {
            from,
            started: Instant::now(),
        });
        cx.notify();
    }

    /// How far open the tree is drawn, 0 to 1.
    pub(super) fn tree_reveal(&self, now: Instant) -> f32 {
        let target = if self.tree_open { 1. } else { 0. };
        let Some(slide) = self.tree_slide else {
            return target;
        };
        let t = ease(now.duration_since(slide.started).as_secs_f32() / SLIDE.as_secs_f32());
        slide.from + (target - slide.from) * t
    }

    /// Advances the slide; asks for the next frame while it runs.
    pub(super) fn step_slide(&mut self, window: &mut Window) -> f32 {
        let now = Instant::now();
        let reveal = self.tree_reveal(now);
        match self.tree_slide {
            Some(slide) if now.duration_since(slide.started) < SLIDE => {
                window.request_animation_frame()
            }
            Some(_) => self.tree_slide = None,
            None => {}
        }
        reveal
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
