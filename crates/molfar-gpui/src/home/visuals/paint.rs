use gpui::{Bounds, Pixels};

pub(crate) fn noise(seed: u32) -> f32 {
    let mut x = seed.wrapping_mul(0x9E37_79B9) ^ 0x85EB_CA6B;
    x ^= x >> 16;
    x = x.wrapping_mul(0x7FEB_352D);
    x ^= x >> 15;
    x = x.wrapping_mul(0x846C_A68B);
    x ^= x >> 16;
    (x & 0x00FF_FFFF) as f32 / 0x0100_0000 as f32
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
