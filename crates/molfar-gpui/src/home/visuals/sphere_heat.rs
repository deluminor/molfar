use super::paint::noise;
use gpui::Hsla;

pub(super) const SPARKS: u32 = 36;
const LIMIT: f32 = 1.85;

pub(super) fn glow(heat: f32) -> f32 {
    let t = heat.clamp(0., 1.);
    t * t * (3. - 2. * t)
}

pub(super) fn tint(accent: Hsla, heat: f32, depth: f32) -> Hsla {
    let amount = glow(heat);
    let depth = depth.clamp(0., 1.);
    let hot_h = 0.015 + depth * 0.10;
    let hot_s = 0.92 - depth * 0.42;
    let hot_l = 0.38 + depth * 0.44;
    Hsla {
        h: mix_hue(accent.h, hot_h, amount),
        s: accent.s + (hot_s - accent.s) * amount,
        l: accent.l + (hot_l - accent.l) * amount,
        a: accent.a,
    }
}

fn mix_hue(from: f32, to: f32, t: f32) -> f32 {
    let mut delta = to - from;
    if delta > 0.5 {
        delta -= 1.;
    } else if delta < -0.5 {
        delta += 1.;
    }
    (from + delta * t).rem_euclid(1.)
}

pub(super) fn displace(
    point: (f32, f32, f32),
    index: u32,
    heat: f32,
    spin: (f32, f32),
) -> (f32, f32, f32) {
    let amount = glow(heat);
    if amount == 0. {
        return point;
    }

    let (x, y, z) = point;
    let equator = centrifuge(x, y, spin);
    let shed = noise(index + 19);
    let radial = 1. + amount * (0.06 + equator * (0.10 + shed * shed * 0.55));
    // Dragging right stores a negative yaw rate, which carries the front toward +x.
    let kick = amount * shed * shed * equator;
    contain((
        x * radial - spin.0 * kick * 0.7,
        y * radial - spin.1 * kick * 0.55,
        z * radial,
    ))
}

fn centrifuge(x: f32, y: f32, spin: (f32, f32)) -> f32 {
    let yaw = spin.0.abs();
    let pitch = spin.1.abs();
    let weight = yaw + pitch;
    let from_yaw = (1. - y * y).clamp(0., 1.);
    let from_pitch = (1. - x * x).clamp(0., 1.);
    if weight < 0.001 {
        from_yaw
    } else {
        (from_yaw * yaw + from_pitch * pitch) / weight
    }
}

fn contain(point: (f32, f32, f32)) -> (f32, f32, f32) {
    let scale = (point.0 * point.0 + point.1 * point.1 + point.2 * point.2).sqrt();
    if scale <= 1. {
        return point;
    }
    let room = LIMIT - 1.;
    let eased = room * (1. - (-(scale - 1.) / room).exp());
    let k = (1. + eased) / scale;
    (point.0 * k, point.1 * k, point.2 * k)
}

pub(super) struct Spark {
    pub x: f32,
    pub y: f32,
    pub opacity: f32,
    pub warmth: f32,
}

pub(super) fn spark(
    index: u32,
    origin: (f32, f32),
    time: f32,
    heat: f32,
    spin: (f32, f32),
) -> Spark {
    let amount = glow(heat);
    let life = (time * (0.85 + noise(index + 40) * 0.7) + noise(index + 17)).fract();
    let fade = (life * 5.).min(1.) * ((1. - life) * 2.4).min(1.);
    let travel = life * (0.28 + amount * 0.85);
    let jitter = noise(index + 90) - 0.5;
    Spark {
        x: origin.0 - spin.0 * travel * 1.25 + jitter * 0.1 * life,
        y: origin.1 - spin.1 * travel * 0.85 + life * life * 0.38,
        opacity: fade * amount,
        warmth: 1. - life,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn length(point: (f32, f32, f32)) -> f32 {
        (point.0 * point.0 + point.1 * point.1 + point.2 * point.2).sqrt()
    }

    fn accent() -> Hsla {
        gpui::hsla(0.55, 0.40, 0.62, 1.)
    }

    #[test]
    fn cold_color_is_the_accent_and_heat_runs_red_to_yellow() {
        let cold = tint(accent(), 0., 1.);
        assert!((cold.h - 0.55).abs() < 1e-5);
        assert!((cold.l - 0.62).abs() < 1e-5);

        let front = tint(accent(), 1., 1.);
        let back = tint(accent(), 1., 0.);
        assert!((0.08..0.16).contains(&front.h));
        assert!(front.l > 0.75);
        assert!(back.h < 0.05 || back.h > 0.98);
        assert!(back.l < 0.5);
        assert!(tint(accent(), 0.5, 1.).l > cold.l);
        assert!(tint(accent(), 0.5, 1.).l < front.l);
    }

    #[test]
    fn shell_stays_put_when_cold_and_swells_smoothly_when_hot() {
        let point = (0.90, 0.0, 0.435);
        let spin = (-1., 0.);
        assert_eq!(displace(point, 4, 0., spin), point);

        let mut previous = length(point);
        for step in 1..=5 {
            let heat = step as f32 / 5.;
            let placed = displace(point, 4, heat, spin);
            let radius = length(placed);
            assert!(radius > previous, "{radius} should grow past {previous}");
            assert!(radius < LIMIT + 0.001);
            assert!(placed.0.is_finite() && placed.1.is_finite() && placed.2.is_finite());
            previous = radius;
        }
    }

    #[test]
    fn sparks_are_absent_when_cold_and_fade_along_their_flight() {
        for index in 0..SPARKS {
            let cold = spark(index, (0.2, 0.1), index as f32 * 0.17, 0., (-1., 0.));
            assert_eq!(cold.opacity, 0.);
        }

        let mut peak = 0_f32;
        let mut saw_dark = false;
        let mut flew_with_spin = false;
        for tick in 0..80 {
            let sample = spark(3, (0.2, 0.1), tick as f32 * 0.05, 1., (-1., 0.));
            peak = peak.max(sample.opacity);
            saw_dark |= sample.opacity < 0.02;
            flew_with_spin |= sample.x > 0.45;
            assert!((-3.5..=3.5).contains(&sample.x));
            assert!((-3.5..=3.5).contains(&sample.y));
            assert!((0. ..=1.).contains(&sample.warmth));
        }
        assert!(peak > 0.5);
        assert!(saw_dark);
        assert!(flew_with_spin);
    }
}
