use super::paint::{disc, extent, glow, noise};
use crate::{home::layout::state::BrandVisual, pulse, theme::*};
use gpui::{
    Bounds, Context, Hsla, Pixels, Render, Window, canvas, div, hsla, point, prelude::*, px,
};
use std::f32::consts::TAU;

/// Its own view: the animation clock repaints only this card.
pub(crate) struct BrandView {
    pub visual: BrandVisual,
}

impl Render for BrandView {
    fn render(&mut self, _: &mut Window, _: &mut Context<Self>) -> impl IntoElement {
        let visual = self.visual;
        div()
            .id("home-brand-visual")
            .debug_selector(move || format!("home-brand-{}", visual.key()))
            .size_full()
            .child(
                canvas(
                    |_, _, _| (),
                    move |bounds, _, window, cx| {
                        let time = if pulse::request(pulse::Rate::Smooth, window, cx) {
                            pulse::elapsed(cx).as_secs_f32()
                        } else {
                            1.
                        };
                        match visual {
                            BrandVisual::Orb => orb(bounds, time, window),
                            BrandVisual::Fire => fire(bounds, time, window),
                            BrandVisual::Sphere => sphere(bounds, time, window),
                        }
                    },
                )
                .size_full(),
            )
    }
}

fn orb(bounds: Bounds<Pixels>, time: f32, window: &mut Window) {
    let (width, height) = extent(bounds);
    let center = bounds.center();
    let accent = accent_color();
    let breath = 1. + 0.05 * (time * TAU / 4.).sin();
    let radius = width.min(height) * 0.28 * breath;

    glow(window, center, radius * 1.9, accent.opacity(0.35), 14);
    glow(window, center, radius, accent.opacity(0.9), 10);
    disc(window, center, radius * 0.35, white(0.55));

    for ring in 0..3 {
        let tilt = 0.35 + ring as f32 * 0.22;
        let orbit = radius * (1.35 + ring as f32 * 0.28);
        let speed = 0.35 + ring as f32 * 0.17;
        for trail in 0..14 {
            let angle = time * speed * TAU - trail as f32 * 0.07 + ring as f32 * 2.1;
            let at = center + point(px(orbit * angle.cos()), px(orbit * tilt * angle.sin()));
            let fade = 1. - trail as f32 / 14.;
            disc(window, at, 2.4 * fade + 0.4, accent.opacity(0.85 * fade));
        }
    }
}

fn fire(bounds: Bounds<Pixels>, time: f32, window: &mut Window) {
    let (width, height) = extent(bounds);
    let base = bounds.origin + point(px(width / 2.), px(height * 0.92));
    let scale = width.min(height);
    glow(window, base, scale * 0.45, hsla(0.05, 0.95, 0.5, 0.35), 10);

    let embers = (scale / 2.).clamp(40., 140.) as u32;
    for index in 0..embers {
        let period = 1.1 + noise(index) * 1.4;
        let progress = (time / period + noise(index + 997)).fract();
        let spread = (noise(index + 31) - 0.5) * scale * 0.55 * (1. - progress * 0.7);
        let sway = (progress * 7. + index as f32).sin() * scale * 0.025;
        let at = base + point(px(spread + sway), px(-progress * height * 0.85));
        let heat = 1. - progress;
        let color: Hsla = hsla(0.02 + 0.11 * heat, 0.95, 0.45 + 0.25 * heat, 0.9 * heat);
        disc(window, at, (scale * 0.05 * heat).max(0.8), color);
    }
}

fn sphere(bounds: Bounds<Pixels>, time: f32, window: &mut Window) {
    let (width, height) = extent(bounds);
    let center = bounds.center();
    let radius = width.min(height) * 0.38;
    let accent = accent_color();
    let spin = time * 0.45;
    let (tilt_sin, tilt_cos) = 0.42f32.sin_cos();
    glow(window, center, radius * 1.25, accent.opacity(0.18), 8);

    for lat in 0..13 {
        let latitude = (lat as f32 / 12. - 0.5) * std::f32::consts::PI;
        let ring = (latitude.cos() * 26.).max(1.) as u32;
        for lon in 0..ring {
            let longitude = lon as f32 / ring as f32 * TAU + spin;
            let x = radius * latitude.cos() * longitude.sin();
            let y = radius * latitude.sin();
            let z = radius * latitude.cos() * longitude.cos();
            let (y, z) = (y * tilt_cos - z * tilt_sin, y * tilt_sin + z * tilt_cos);
            let depth = (z / radius + 1.) / 2.;
            disc(
                window,
                center + point(px(x), px(y)),
                0.6 + 1.6 * depth,
                accent.opacity(0.12 + 0.85 * depth * depth),
            );
        }
    }
}
