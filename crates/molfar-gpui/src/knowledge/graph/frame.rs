//! One frame of the graph in screen space: nodes far to near, edges bucketed
//! by depth so a few paths draw them all, and the spotlight around the
//! hovered or selected note.
use super::palette::Palette;
use gpui::Hsla;
use molfar_core::knowledge::{Camera, GraphProjection, Point3, Projected};
use std::collections::HashSet;

pub(super) type Segment = ((f32, f32), (f32, f32));

#[derive(Clone, Debug)]
pub(super) struct NodeDraw {
    pub x: f32,
    pub y: f32,
    pub radius: f32,
    pub color: Hsla,
    pub ring: bool,
}

#[derive(Default)]
pub(super) struct Frame {
    pub nodes: Vec<NodeDraw>,
    /// Far, middle and near edges, then edges touching the focus.
    pub edges: [Vec<Segment>; 4],
    pub projected: Vec<Option<Projected>>,
    pub radii: Vec<f32>,
}

pub(super) struct Scene<'a> {
    pub projection: &'a GraphProjection,
    pub positions: &'a [Point3],
    pub camera: Camera,
    pub size: (f32, f32),
    pub hovered: Option<usize>,
    pub selected: Option<usize>,
    pub palette: &'a Palette,
    pub light: bool,
}

const NODE_BASE: f32 = 2.4;
const NODE_DEGREE: f32 = 1.3;

impl Scene<'_> {
    /// The hovered and selected notes with their direct links.
    pub(super) fn focus(&self) -> Option<HashSet<usize>> {
        let mut focus = HashSet::new();
        for index in [self.hovered, self.selected].into_iter().flatten() {
            focus.insert(index);
            focus.extend(self.projection.neighbors(index));
        }
        (!focus.is_empty()).then_some(focus)
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
        let fade = |depth: f32| 1. - (depth - near) / span * 0.6;
        let focus = self.focus();

        let mut radii = vec![0.; projected.len()];
        let mut nodes: Vec<(f32, NodeDraw)> = Vec::with_capacity(projected.len());
        for (index, item) in projected.iter().enumerate() {
            let (Some(item), Some(node)) = (item, self.projection.nodes.get(index)) else {
                continue;
            };
            let ring = Some(index) == self.selected;
            let size = NODE_BASE + (node.degree as f32).sqrt() * NODE_DEGREE;
            let radius = (size * item.scale).clamp(2., 22.) + if ring { 2. } else { 0. };
            radii[index] = radius;
            let mut color = self.palette.color(&node.group, self.light);
            color.a = fade(item.depth);
            if focus.as_ref().is_some_and(|focus| !focus.contains(&index)) {
                color.a *= 0.22;
            }
            nodes.push((
                item.depth,
                NodeDraw {
                    x: item.x,
                    y: item.y,
                    radius,
                    color,
                    ring,
                },
            ));
        }
        nodes.sort_by(|left, right| right.0.total_cmp(&left.0));

        let mut edges: [Vec<Segment>; 4] = Default::default();
        for edge in &self.projection.edges {
            let (Some(Some(from)), Some(Some(to))) =
                (projected.get(edge.source), projected.get(edge.target))
            else {
                continue;
            };
            let lit = [self.hovered, self.selected]
                .into_iter()
                .flatten()
                .any(|index| index == edge.source || index == edge.target);
            let bucket = if lit {
                3
            } else {
                let depth = ((from.depth + to.depth) / 2. - near) / span;
                2usize.saturating_sub((depth * 3.).floor() as usize)
            };
            edges[bucket].push(((from.x, from.y), (to.x, to.y)));
        }

        Frame {
            nodes: nodes.into_iter().map(|(_, node)| node).collect(),
            edges,
            projected,
            radii,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use molfar_core::knowledge::{GraphEdge, GraphNode};

    fn node(path: &str, degree: usize) -> GraphNode {
        GraphNode {
            path: path.into(),
            title: path.into(),
            group: String::new(),
            degree,
        }
    }

    #[test]
    fn nodes_paint_far_to_near_and_the_focus_dims_the_rest() {
        let projection = GraphProjection {
            nodes: vec![node("a", 1), node("b", 1), node("c", 0)],
            edges: vec![GraphEdge {
                source: 0,
                target: 1,
            }],
            ..Default::default()
        };
        let palette = Palette::new(&projection);
        let positions = [[-50., 0., 100.], [0., 0., -100.], [50., 0., 0.]];
        let scene = Scene {
            projection: &projection,
            positions: &positions,
            camera: Camera {
                yaw: 0.,
                pitch: 0.,
                distance: 600.,
            },
            size: (800., 600.),
            hovered: None,
            selected: Some(0),
            palette: &palette,
            light: false,
        };
        let frame = scene.frame();
        let xs: Vec<f32> = frame.nodes.iter().map(|node| node.x).collect();
        assert!((xs[0] - 400.).abs() < 0.01, "the far note paints first");
        assert!(
            xs[1] > 400. && xs[2] < 400.,
            "the selected note paints last"
        );
        assert!(frame.nodes[2].ring);
        assert!(frame.nodes[1].color.a < 0.3, "the unlinked note dims");
        assert_eq!(frame.edges[3].len(), 1, "the selected note's link is lit");
        assert!(frame.radii.iter().all(|radius| *radius >= 2.));
    }
}
