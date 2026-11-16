//! Label placement: candidates come in priority order and a label is kept
//! only when it overlaps none already kept, so names never pile up.

#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct Rect {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

impl Rect {
    fn overlaps(&self, other: &Rect) -> bool {
        self.x < other.x + other.width
            && other.x < self.x + self.width
            && self.y < other.y + other.height
            && other.y < self.y + self.height
    }
}

/// Approximate label box for `title` at `size`px, padded by `pad` on each side.
pub(super) fn label_rect(x: f32, y: f32, title: &str, size: f32, pad: f32) -> Rect {
    let width = (title.chars().count() as f32 * size * 0.56).min(220.) + pad * 2.;
    Rect {
        x,
        y: y - size * 0.9,
        width,
        height: size * 1.8,
    }
}

/// Which candidates to show, first come first kept.
pub(super) fn place(candidates: &[Rect]) -> Vec<bool> {
    let mut kept: Vec<Rect> = Vec::new();
    candidates
        .iter()
        .map(|rect| {
            let free = kept.iter().all(|other| !other.overlaps(rect));
            if free {
                kept.push(*rect);
            }
            free
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn overlapping_labels_yield_to_earlier_ones() {
        let a = label_rect(0., 0., "Goals & Life Plans", 12., 4.);
        let b = label_rect(20., 4., "Weekly MOC", 11., 0.);
        let c = label_rect(0., 60., "Home", 11., 0.);
        assert_eq!(place(&[a, b, c]), [true, false, true]);
    }
}
