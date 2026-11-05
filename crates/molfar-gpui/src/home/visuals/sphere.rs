use super::{
    paint::{extent, noise},
    sphere_heat,
};
use crate::theme::*;
use gpui::{Bounds, Hsla, Pixels, Point, Window, fill, point, px, size};

const POINTS: u32 = 280;
const FALLING: u32 = 32;
const GOLDEN_ANGLE: f32 = 2.399_963_1;

fn surface(index: u32, yaw: f32, pitch: f32) -> (f32, f32, f32) {
    let y = 1. - 2. * (index as f32 + 0.5) / POINTS as f32;
    let ring = (1. - y * y).sqrt();
    let angle = index as f32 * GOLDEN_ANGLE + yaw;
    let (x, z) = (ring * angle.cos(), ring * angle.sin());
    let (sin, cos) = pitch.sin_cos();
    (x, y * cos - z * sin, y * sin + z * cos)
}

fn falling(index: u32, time: f32) -> (f32, f32, f32) {
    let progress = (time / (4. + noise(index) * 4.) + noise(index + 97)).fract();
    let x = (noise(index + 23) - 0.5) * 1.8 + (time * 0.3 + index as f32).sin() * 0.025;
    let opacity = (progress * 5.).min(1.) * ((1. - progress) * 4.).min(1.);
    (x, -0.65 + progress * 2.15, opacity)
}

fn pixel(window: &mut Window, at: Point<Pixels>, edge: f32, color: Hsla) {
    window.paint_quad(fill(
        Bounds::new(
            at - point(px(edge / 2.), px(edge / 2.)),
            size(px(edge), px(edge)),
        ),
        color,
    ));
}

pub(super) fn paint(
    bounds: Bounds<Pixels>,
    time: f32,
    orientation: (f32, f32),
    heat: f32,
    spin: (f32, f32),
    window: &mut Window,
) {
    let (width, height) = extent(bounds);
    let radius = width.min(height) * 0.34;
    let center = bounds.origin + point(px(width * 0.5), px(height * 0.44));
    let accent = accent_color();
    let edge = (radius / 65.).clamp(1., 2.);
    let glow = sphere_heat::glow(heat);
    let (yaw, pitch) = orientation;

    for front in [false, true] {
        for index in 0..POINTS {
            let (x, y, z) = sphere_heat::displace(surface(index, yaw, pitch), index, heat, spin);
            if (z >= 0.) != front {
                continue;
            }
            let depth = ((z + 1.) * 0.5).clamp(0., 1.);
            let mut color = sphere_heat::tint(accent, heat, depth);
            color.a = 0.13 + depth * depth * 0.77;
            pixel(
                window,
                center + point(px(x * radius), px(y * radius)),
                edge * (1. + glow * (0.12 + depth * 0.28)),
                color,
            );
        }
    }

    let rain = 1. - glow;
    if rain > 0.02 {
        for index in 0..FALLING {
            let (x, y, opacity) = falling(index, time);
            let mut color = sphere_heat::tint(accent, heat, 0.3);
            color.a = opacity * 0.32 * rain;
            pixel(
                window,
                center + point(px(x * radius), px(y * radius)),
                edge * 0.7,
                color,
            );
        }
    }

    for index in 0..sphere_heat::SPARKS {
        let seed = index * 7 % POINTS;
        let origin = sphere_heat::displace(surface(seed, yaw, pitch), seed, heat, spin);
        let spark = sphere_heat::spark(index, (origin.0, origin.1), time, heat, spin);
        if spark.opacity < 0.015 {
            continue;
        }
        let mut color = sphere_heat::tint(accent, 1., spark.warmth);
        color.a = spark.opacity;
        pixel(
            window,
            center + point(px(spark.x * radius), px(spark.y * radius)),
            edge * (0.45 + spark.warmth * 0.85),
            color,
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn surface_is_evenly_bounded_and_moves_continuously() {
        for index in 0..POINTS {
            let (x, y, z) = surface(index, 0., 0.32);
            assert!((x * x + y * y + z * z - 1.).abs() < 0.0001);
            let (later, _, _) = surface(index, 0.0018, 0.32);
            assert!((later - x).abs() < 0.003);
        }
    }

    #[test]
    fn foreground_moves_right_with_negative_yaw_and_down_with_negative_pitch() {
        let index = (0..POINTS)
            .find(|index| {
                let (_, y, z) = surface(*index, 0., 0.);
                z > 0.8 && y.abs() < 0.3
            })
            .unwrap();
        let (x, y, _) = surface(index, 0., 0.);
        assert!(surface(index, -0.01, 0.).0 > x);
        assert!(surface(index, 0., -0.01).1 > y);
    }

    #[test]
    fn falling_pixels_are_small_bounded_and_fade_at_wrap() {
        for index in 0..FALLING {
            for tick in 0..100 {
                let (x, y, alpha) = falling(index, tick as f32 * 0.1);
                assert!((-0.93..=0.93).contains(&x));
                assert!((-0.65..=1.5).contains(&y));
                assert!((0. ..=1.).contains(&alpha));
            }
        }
    }
}
