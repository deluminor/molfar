use gpui::{Bounds, Hsla, Pixels, Point, Window, fill, point, px, size};

/// Stable pseudo-random value in `0..1` for a particle index.
pub(crate) fn noise(seed: u32) -> f32 {
    let mut x = seed.wrapping_mul(0x9E37_79B9) ^ 0x85EB_CA6B;
    x ^= x >> 16;
    x = x.wrapping_mul(0x7FEB_352D);
    x ^= x >> 15;
    x = x.wrapping_mul(0x846C_A68B);
    x ^= x >> 16;
    (x & 0x00FF_FFFF) as f32 / 0x0100_0000 as f32
}

pub(crate) fn disc(window: &mut Window, center: Point<Pixels>, radius: f32, color: Hsla) {
    if radius <= 0. || color.a <= 0.001 {
        return;
    }
    let corner = center - point(px(radius), px(radius));
    window.paint_quad(
        fill(
            Bounds::new(corner, size(px(radius * 2.), px(radius * 2.))),
            color,
        )
        .corner_radii(px(radius)),
    );
}

/// Soft radial glow made of stacked translucent discs.
pub(crate) fn glow(
    window: &mut Window,
    center: Point<Pixels>,
    radius: f32,
    color: Hsla,
    layers: usize,
) {
    for layer in 0..layers {
        let share = 1. - layer as f32 / layers as f32;
        disc(
            window,
            center,
            radius * share,
            color.opacity(color.a / layers as f32 * 1.6),
        );
    }
}

pub(crate) fn extent(bounds: Bounds<Pixels>) -> (f32, f32) {
    (
        bounds.size.width.to_f64() as f32,
        bounds.size.height.to_f64() as f32,
    )
}

#[cfg(test)]
mod tests {
    use super::noise;

    #[test]
    fn noise_is_stable_and_spread() {
        assert_eq!(noise(7), noise(7));
        let values: Vec<f32> = (0..1000).map(noise).collect();
        assert!(values.iter().all(|value| (0. ..1.).contains(value)));
        let mean = values.iter().sum::<f32>() / values.len() as f32;
        assert!((0.4..0.6).contains(&mean));
    }
}
