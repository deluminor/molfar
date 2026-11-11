//! Paints a [`Frame`]: edge groups faintest first, then nodes far to near
//! with a soft highlight that reads as a sphere and a ring on the selection.
use super::frame::{Frame, Segment};
use crate::theme::{background_base, content, white};
use gpui::{Bounds, Hsla, PathBuilder, Pixels, Window, canvas, fill, point, prelude::*, px, size};
use std::{cell::Cell, rc::Rc};

fn disc(
    center: (f32, f32),
    radius: f32,
    color: Hsla,
    origin: gpui::Point<Pixels>,
    window: &mut Window,
) {
    let bounds = Bounds::new(
        origin + point(px(center.0 - radius), px(center.1 - radius)),
        size(px(radius * 2.), px(radius * 2.)),
    );
    window.paint_quad(fill(bounds, color).corner_radii(px(radius)));
}

fn stroke(
    segments: &[Segment],
    width: f32,
    color: Hsla,
    origin: gpui::Point<Pixels>,
    window: &mut Window,
) {
    if segments.is_empty() {
        return;
    }
    let mut path = PathBuilder::stroke(px(width));
    for ((x1, y1), (x2, y2)) in segments {
        path.move_to(origin + point(px(*x1), px(*y1)));
        path.line_to(origin + point(px(*x2), px(*y2)));
    }
    if let Ok(path) = path.build() {
        window.paint_path(path, color);
    }
}

/// The graph canvas. `bounds` receives the painted area for hit testing and
/// the next frame's projection.
pub(super) fn graph_canvas(frame: Frame, bounds: Rc<Cell<Bounds<Pixels>>>) -> impl IntoElement {
    canvas(
        move |area, window, _| {
            if bounds.get().size != area.size {
                window.refresh();
            }
            bounds.set(area);
        },
        move |area, _, window, _| {
            let origin = area.origin;
            window.with_content_mask(Some(gpui::ContentMask { bounds: area }), |window| {
                for group in &frame.edges {
                    stroke(&group.segments, group.width, group.color, origin, window);
                }

                for node in &frame.nodes {
                    let center = (node.x, node.y);
                    if node.glow > 0.01 {
                        disc(
                            center,
                            node.radius * (2. + node.glow),
                            content(0.09 * node.glow),
                            origin,
                            window,
                        );
                        disc(
                            center,
                            node.radius + 3.2,
                            content(0.85 * node.glow),
                            origin,
                            window,
                        );
                        let mut gap = background_base();
                        gap.a = node.glow;
                        disc(center, node.radius + 1.7, gap, origin, window);
                    }
                    disc(center, node.radius, node.color, origin, window);
                    if node.radius > 4. {
                        let shine = (node.x - node.radius * 0.3, node.y - node.radius * 0.35);
                        disc(
                            shine,
                            node.radius * 0.34,
                            white(0.2 * node.color.a),
                            origin,
                            window,
                        );
                    }
                }
            });
        },
    )
    .size_full()
}
