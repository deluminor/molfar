use super::layout::{
    geometry::{Grid, Rect},
    model::{Item, WidgetId},
};
use std::{
    collections::HashMap,
    time::{Duration, Instant},
};

const GLIDE: Duration = Duration::from_millis(220);

struct Track {
    item: Item,
    from: Rect,
    start: Instant,
}

/// Cards glide to new cells instead of jumping when the arrangement changes.
/// A width change alone moves them at once: only cell changes animate.
#[derive(Default)]
pub(crate) struct Reflow {
    tracks: HashMap<WidgetId, Track>,
}

impl Reflow {
    pub(crate) fn place(
        &mut self,
        item: Item,
        grid: &Grid,
        now: Instant,
        animate: bool,
    ) -> (Rect, bool) {
        let target = grid.rect(&item);
        let Some(track) = self.tracks.get_mut(&item.id) else {
            self.tracks.insert(
                item.id,
                Track {
                    item,
                    from: target,
                    start: now - GLIDE,
                },
            );
            return (target, false);
        };

        if track.item != item {
            let (current, _) = glide(track, grid, now);
            *track = Track {
                item,
                from: current,
                start: if animate { now } else { now - GLIDE },
            };
        }
        glide(track, grid, now)
    }

    /// A dropped card glides from where the pointer let go into its cell.
    pub(crate) fn land(&mut self, item: Item, from: Rect, now: Instant) {
        self.tracks.insert(
            item.id,
            Track {
                item,
                from,
                start: now,
            },
        );
    }
}

fn glide(track: &Track, grid: &Grid, now: Instant) -> (Rect, bool) {
    let to = grid.rect(&track.item);
    let t =
        (now.saturating_duration_since(track.start).as_secs_f32() / GLIDE.as_secs_f32()).min(1.);
    if t >= 1. {
        return (to, false);
    }
    let eased = super::motion::ease_out(t);
    let lerp = |a: f32, b: f32| a + (b - a) * eased;
    (
        Rect {
            x: lerp(track.from.x, to.x),
            y: lerp(track.from.y, to.y),
            w: lerp(track.from.w, to.w),
            h: lerp(track.from.h, to.h),
        },
        true,
    )
}

#[cfg(test)]
mod tests {
    use super::{GLIDE, Reflow};
    use crate::home::layout::{
        geometry::Grid,
        model::{WidgetId, default_item},
    };
    use std::time::Instant;

    #[test]
    fn cell_changes_glide_and_width_changes_snap() {
        let mut reflow = Reflow::default();
        let grid = Grid::new(1200.);
        let start = Instant::now();
        let item = default_item(WidgetId::Usage);
        let from = grid.rect(&item);
        assert_eq!(reflow.place(item, &grid, start, true), (from, false));

        let moved = super::Item { y: 0, ..item };
        assert_eq!(
            reflow.place(moved, &grid, start + GLIDE / 2, true),
            (from, true)
        );
        let (mid, moving) = reflow.place(moved, &grid, start + GLIDE / 2 + GLIDE / 4, true);
        assert!(moving);
        assert!(mid.y < from.y && mid.y > grid.rect(&moved).y);
        assert_eq!(
            reflow.place(moved, &grid, start + GLIDE * 2, true),
            (grid.rect(&moved), false)
        );

        let wider = Grid::new(1600.);
        assert_eq!(
            reflow.place(moved, &wider, start + GLIDE * 2, true),
            (wider.rect(&moved), false)
        );

        let back = super::Item { y: 8, ..moved };
        let still = start + GLIDE * 3;
        assert_eq!(
            reflow.place(back, &grid, still, false),
            (grid.rect(&back), false)
        );
    }
}
