//! Loading states: an orbit loader that echoes the graph, and shimmering
//! skeleton rows for the tree while a vault connects or scans.
use crate::{pulse, theme::*};
use gpui::{AnyElement, ElementId, div, prelude::*, px};
use std::{f32::consts::TAU, time::Duration};

const ORBIT: Duration = Duration::from_millis(2_400);
const SHIMMER: Duration = Duration::from_millis(1_400);
const LOADER_SIDE: f32 = 64.;
/// Tilt, phase offset and radius of each orbiting dot.
const ORBITS: [(f32, f32, f32); 3] = [(0.32, 0., 26.), (0.8, 0.33, 20.), (0.55, 0.66, 14.)];
const SKELETON_WIDTHS: [f32; 9] = [0.62, 0.48, 0.74, 0.4, 0.66, 0.54, 0.7, 0.36, 0.58];

fn orbit_frame(phase: f32) -> gpui::Div {
    let center = LOADER_SIDE / 2.;
    let accent = accent_color();
    div()
        .relative()
        .size(px(LOADER_SIDE))
        .child(
            div()
                .absolute()
                .left(px(center - 5.))
                .top(px(center - 5.))
                .size(px(10.))
                .rounded_full()
                .bg(accent)
                .opacity(0.55 + 0.35 * (phase * TAU).sin().abs()),
        )
        .children(ORBITS.iter().map(|(tilt, offset, radius)| {
            let angle = (phase + offset) * TAU;
            let depth = angle.sin();
            let side = 5. + depth * 1.8;
            let mut color = accent;
            color.a = 0.45 + 0.4 * (depth + 1.) / 2.;
            div()
                .absolute()
                .left(px(center + angle.cos() * radius - side / 2.))
                .top(px(center + depth * radius * tilt - side / 2.))
                .size(px(side))
                .rounded_full()
                .bg(color)
        }))
}

/// The animated orbit with a caption and optional detail line.
pub(super) fn orbit_loader(
    id: impl Into<ElementId>,
    caption: String,
    detail: Option<String>,
) -> AnyElement {
    div()
        .flex()
        .flex_col()
        .items_center()
        .gap_3()
        .child(pulse::looping(id, ORBIT, pulse::Rate::Smooth, orbit_frame))
        .child(
            div()
                .text_size(px(13.))
                .text_color(content(0.8))
                .child(caption),
        )
        .children(detail.map(|detail| {
            div()
                .text_size(px(11.))
                .text_color(content(0.45))
                .child(detail)
        }))
        .into_any_element()
}

/// Shimmering placeholder rows in the tree's rhythm.
pub(super) fn skeleton_rows(id: impl Into<ElementId>) -> AnyElement {
    pulse::looping(id, SHIMMER, pulse::Rate::Half, |phase| {
        div().flex().flex_col().gap(px(10.)).px_3().py_3().children(
            SKELETON_WIDTHS
                .iter()
                .enumerate()
                .map(move |(index, width)| {
                    let wave = 0.5 + 0.5 * ((phase - index as f32 * 0.08) * TAU).cos();
                    div()
                        .flex()
                        .items_center()
                        .gap_2()
                        .pl(px(if index % 3 == 0 { 0. } else { 14. }))
                        .child(
                            div()
                                .size(px(12.))
                                .rounded_sm()
                                .bg(content(0.05 + 0.05 * wave)),
                        )
                        .child(
                            div()
                                .h(px(10.))
                                .w(gpui::relative(*width))
                                .rounded_sm()
                                .bg(content(0.05 + 0.05 * wave)),
                        )
                }),
        )
    })
    .into_any_element()
}
