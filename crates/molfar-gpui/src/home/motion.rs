use std::time::Duration;

pub(crate) const ENTRANCE: Duration = Duration::from_millis(460);
pub(crate) const STAGGER: f32 = 0.06;
pub(crate) const RISE: f32 = 10.;

pub(crate) fn ease_out(t: f32) -> f32 {
    1. - (1. - t).powi(3)
}

/// Progress of the `index`th card when every card shares one animation:
/// later cards start a little later and still land together at the end.
pub(crate) fn staggered(t: f32, index: usize) -> f32 {
    let delay = (index as f32 * STAGGER).min(0.5);
    ease_out(((t - delay) / (1. - delay)).clamp(0., 1.))
}

#[cfg(test)]
mod tests {
    use super::staggered;

    #[test]
    fn stagger_starts_later_cards_later_and_lands_together() {
        assert_eq!(staggered(0., 0), 0.);
        assert!(staggered(0.2, 0) > staggered(0.2, 3));
        assert_eq!(staggered(0.1, 4), 0.);
        assert_eq!(staggered(1., 9), 1.);
    }
}
