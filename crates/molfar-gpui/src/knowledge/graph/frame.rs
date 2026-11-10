//! One frame of the graph in screen space, drawn from eased brightness
//! levels: one light tone throughout, bright where the open note is,
//! receding everywhere else.
use super::emphasis::Levels;
use crate::theme::content;
use gpui::Hsla;
use molfar_core::knowledge::{Camera, GraphProjection, Point3, Projected};
use std::collections::BTreeMap;

pub(super) type Segment = ((f32, f32), (f32, f32));

#[derive(Clone, Debug)]
pub(super) struct NodeDraw {
    pub x: f32,
    pub y: f32,
    pub radius: f32,
    pub color: Hsla,
    /// Halo and ring strength, 0 to 1.
    pub glow: f32,
}

pub(super) struct EdgeGroup {
    pub color: Hsla,
    pub width: f32,
    pub segments: Vec<Segment>,
}

#[derive(Default)]
pub(super) struct Frame {
    pub nodes: Vec<NodeDraw>,
    /// Painted in order, faintest first.
    pub edges: Vec<EdgeGroup>,
    pub projected: Vec<Option<Projected>>,
    pub radii: Vec<f32>,
}

pub(super) struct Scene<'a> {
    pub projection: &'a GraphProjection,
    pub positions: &'a [Point3],
    pub camera: Camera,
    pub size: (f32, f32),
    pub levels: &'a Levels,
}

const NODE_BASE: f32 = 1.8;
const NODE_DEGREE: f32 = 0.85;
/// Edge alpha steps; each step is one path.
const EDGE_STEPS: f32 = 24.;
/// Links brighter than this draw a little thicker.
const WIDE_EDGE: f32 = 0.3;

impl Scene<'_> {
    fn level(values: &[f32], index: usize) -> f32 {
        values.get(index).copied().unwrap_or(0.)
    }

    fn edge_groups(&self, projected: &[Option<Projected>], near: f32, span: f32) -> Vec<EdgeGroup> {
        let mut groups: BTreeMap<(u16, bool), Vec<Segment>> = BTreeMap::new();
        for (position, edge) in self.projection.edges.iter().enumerate() {
            let (Some(Some(from)), Some(Some(to))) =
                (projected.get(edge.source), projected.get(edge.target))
            else {
                continue;
            };
            let level = Self::level(&self.levels.edges, position);
            let depth = ((from.depth + to.depth) / 2. - near) / span;
            let alpha = level * (1. - 0.45 * depth);
            let step = (alpha * EDGE_STEPS).round() as u16;
            if step == 0 {
                continue;
            }
            groups
                .entry((step, level > WIDE_EDGE))
                .or_default()
                .push(((from.x, from.y), (to.x, to.y)));
        }
        groups
            .into_iter()
            .map(|((step, wide), segments)| EdgeGroup {
                color: content(step as f32 / EDGE_STEPS),
                width: if wide { 1.3 } else { 1. },
                segments,
            })
            .collect()
    }

    pub(super) fn frame(&self) -> Frame {
        let (width, height) = self.size;
        let projected: Vec<Option<Projected>> = self
            .positions
            .iter()
            .map(|point| self.camera.project(*point, width, height))
            .collect();
        let (near, far) = projected
            .iter()
            .flatten()
            .fold((f32::MAX, f32::MIN), |(near, far), item| {
                (near.min(item.depth), far.max(item.depth))
            });
        let span = (far - near).max(1.);

        let mut radii = vec![0.; projected.len()];
        let mut nodes: Vec<(f32, NodeDraw)> = Vec::with_capacity(projected.len());
        for (index, item) in projected.iter().enumerate() {
            let (Some(item), Some(node)) = (item, self.projection.nodes.get(index)) else {
                continue;
            };
            let level = Self::level(&self.levels.nodes, index);
            let glow = Self::level(&self.levels.glow, index);
            let size = NODE_BASE + (node.degree as f32).sqrt() * NODE_DEGREE;
            let radius = (size * item.scale).clamp(1.6, 14.) + glow * 1.5;
            radii[index] = radius;
            let fade = 1. - (item.depth - near) / span;
            nodes.push((
                item.depth,
                NodeDraw {
                    x: item.x,
                    y: item.y,
                    radius,
                    color: content(level * (0.62 + 0.38 * fade.max(glow))),
                    glow,
                },
            ));
        }
        nodes.sort_by(|left, right| right.0.total_cmp(&left.0));

        Frame {
            nodes: nodes.into_iter().map(|(_, node)| node).collect(),
            edges: self.edge_groups(&projected, near, span),
            projected,
            radii,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::super::emphasis::targets;
    use super::*;
    use molfar_core::knowledge::{GraphEdge, GraphNode};

    fn node(path: &str) -> GraphNode {
        GraphNode {
            path: path.into(),
            title: path.into(),
            group: String::new(),
            degree: 1,
        }
    }

    #[test]
    fn nodes_paint_far_to_near_and_brightness_follows_the_levels() {
        let projection = GraphProjection {
            nodes: vec![node("a"), node("b"), node("c")],
            edges: vec![GraphEdge {
                source: 0,
                target: 1,
            }],
            ..Default::default()
        };
        let levels = targets(&projection, Some(0), None);
        let positions = [[-50., 0., 100.], [0., 0., -100.], [50., 0., 0.]];
        let frame = Scene {
            projection: &projection,
            positions: &positions,
            camera: Camera {
                yaw: 0.,
                pitch: 0.,
                distance: 600.,
            },
            size: (800., 600.),
            levels: &levels,
        }
        .frame();
        let last = frame.nodes.last().unwrap();
        assert_eq!(
            last.glow, 1.,
            "the nearest, open note paints last and glows"
        );
        let tone = last.color;
        assert!(
            frame
                .nodes
                .iter()
                .all(|node| (node.color.h, node.color.s, node.color.l) == (tone.h, tone.s, tone.l))
        );
        assert!(
            frame.nodes.iter().any(|node| node.color.a < 0.1),
            "unrelated notes recede"
        );
        let brightest = frame.edges.last().unwrap();
        assert_eq!(brightest.segments.len(), 1);
        assert!(brightest.width > 1.);
    }
}
