//! One frame of the graph in screen space. Nodes are one neutral tone; the
//! note open in the panel lights itself, its direct links and, more faintly,
//! their links, and sinks the rest of the vault. Hover only lifts one node.
use crate::theme::{accent_color, content};
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
    pub glow: bool,
    pub ring: bool,
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
    pub hovered: Option<usize>,
    pub selected: Option<usize>,
}

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Debug)]
pub(super) enum Tier {
    Rest,
    Second,
    Neighbor,
    Focus,
}

const NODE_BASE: f32 = 1.8;
const NODE_DEGREE: f32 = 0.85;

impl Scene<'_> {
    /// Each node's distance from the focus, capped at two links.
    pub(super) fn tiers(&self) -> Option<Vec<Tier>> {
        let focus: Vec<usize> = [self.selected, self.hovered]
            .into_iter()
            .flatten()
            .collect();
        if focus.is_empty() {
            return None;
        }
        let mut tiers = vec![Tier::Rest; self.projection.nodes.len()];
        let mut first = HashSet::new();
        for index in &focus {
            first.extend(self.projection.neighbors(*index));
        }
        for edge in &self.projection.edges {
            for (from, to) in [(edge.source, edge.target), (edge.target, edge.source)] {
                if first.contains(&from) {
                    tiers[to] = tiers[to].max(Tier::Second);
                }
            }
        }
        for index in first {
            tiers[index] = Tier::Neighbor;
        }
        for index in focus {
            tiers[index] = Tier::Focus;
        }
        Some(tiers)
    }

    fn node_color(tier: Option<Tier>, fade: f32) -> Hsla {
        match tier {
            None => content(0.32 + 0.38 * fade),
            Some(Tier::Focus) => accent_color(),
            Some(Tier::Neighbor) => content(0.92),
            Some(Tier::Second) => content(0.22 + 0.12 * fade),
            Some(Tier::Rest) => content(0.04 + 0.04 * fade),
        }
    }

    fn edge_groups(
        &self,
        projected: &[Option<Projected>],
        tiers: Option<&[Tier]>,
        near: f32,
        span: f32,
    ) -> Vec<EdgeGroup> {
        let mut base: [Vec<Segment>; 3] = Default::default();
        let mut second = Vec::new();
        let mut lit = Vec::new();
        for edge in &self.projection.edges {
            let (Some(Some(from)), Some(Some(to))) =
                (projected.get(edge.source), projected.get(edge.target))
            else {
                continue;
            };
            let segment = ((from.x, from.y), (to.x, to.y));
            let Some(tiers) = tiers else {
                let depth = ((from.depth + to.depth) / 2. - near) / span;
                base[2usize.saturating_sub((depth * 3.).floor() as usize)].push(segment);
                continue;
            };
            let pair = (
                tiers[edge.source].min(tiers[edge.target]),
                tiers[edge.source].max(tiers[edge.target]),
            );
            match pair {
                (Tier::Neighbor | Tier::Focus, Tier::Focus) => lit.push(segment),
                (Tier::Second | Tier::Neighbor, _) => second.push(segment),
                _ => base[0].push(segment),
            }
        }

        let mut accent = accent_color();
        accent.a = 0.75;
        let base_alpha: [f32; 3] = if tiers.is_some() {
            [0.025, 0., 0.]
        } else {
            [0.05, 0.08, 0.13]
        };
        let mut groups: Vec<EdgeGroup> = base
            .into_iter()
            .zip(base_alpha)
            .map(|(segments, alpha)| EdgeGroup {
                color: content(alpha),
                width: 1.,
                segments,
            })
            .collect();
        groups.push(EdgeGroup {
            color: content(0.22),
            width: 1.,
            segments: second,
        });
        groups.push(EdgeGroup {
            color: accent,
            width: 1.6,
            segments: lit,
        });
        groups
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
        let tiers = self.tiers();

        let mut radii = vec![0.; projected.len()];
        let mut nodes: Vec<(f32, NodeDraw)> = Vec::with_capacity(projected.len());
        for (index, item) in projected.iter().enumerate() {
            let (Some(item), Some(node)) = (item, self.projection.nodes.get(index)) else {
                continue;
            };
            let tier = tiers.as_ref().map(|tiers| tiers[index]);
            let ring = Some(index) == self.selected;
            let size = NODE_BASE + (node.degree as f32).sqrt() * NODE_DEGREE;
            let hovered = Some(index) == self.hovered;
            let radius =
                (size * item.scale).clamp(1.6, 14.) + if ring || hovered { 1.5 } else { 0. };
            radii[index] = radius;
            let fade = 1. - (item.depth - near) / span;
            nodes.push((
                item.depth,
                NodeDraw {
                    x: item.x,
                    y: item.y,
                    radius,
                    color: if hovered && tier != Some(Tier::Focus) {
                        content(1.)
                    } else {
                        Self::node_color(tier, fade)
                    },
                    glow: tier == Some(Tier::Focus),
                    ring,
                },
            ));
        }
        nodes.sort_by(|left, right| right.0.total_cmp(&left.0));

        Frame {
            nodes: nodes.into_iter().map(|(_, node)| node).collect(),
            edges: self.edge_groups(&projected, tiers.as_deref(), near, span),
            projected,
            radii,
        }
    }
}

#[cfg(test)]
mod tests {
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
    fn the_focus_lights_its_relatives_by_distance_and_sinks_the_rest() {
        let projection = GraphProjection {
            nodes: vec![node("a"), node("b"), node("c"), node("d")],
            edges: vec![
                GraphEdge {
                    source: 0,
                    target: 1,
                },
                GraphEdge {
                    source: 1,
                    target: 2,
                },
            ],
            ..Default::default()
        };
        let positions = [
            [-50., 0., 100.],
            [0., 0., -100.],
            [50., 0., 0.],
            [80., 0., 0.],
        ];
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
        };
        assert_eq!(
            scene.tiers().unwrap(),
            [Tier::Focus, Tier::Neighbor, Tier::Second, Tier::Rest]
        );
        let frame = scene.frame();
        assert!(
            frame.nodes.last().unwrap().ring,
            "the nearest, selected note paints last"
        );
        let lit = frame.edges.last().unwrap();
        assert_eq!(lit.segments.len(), 1);
        assert_eq!(
            frame.edges[frame.edges.len() - 2].segments.len(),
            1,
            "b–c is second tier"
        );
        assert!(
            frame.nodes.iter().any(|node| node.color.a < 0.11),
            "unrelated notes sink"
        );
    }

    #[test]
    fn without_a_focus_every_note_shares_one_tone() {
        let projection = GraphProjection {
            nodes: vec![node("a"), node("b")],
            ..Default::default()
        };
        let positions = [[0., 0., 0.], [40., 0., 0.]];
        let scene = Scene {
            projection: &projection,
            positions: &positions,
            camera: Camera::default(),
            size: (800., 600.),
            hovered: None,
            selected: None,
        };
        let frame = scene.frame();
        let tone = frame.nodes[0].color;
        assert!(frame.nodes.iter().all(|node| {
            (node.color.h, node.color.s, node.color.l) == (tone.h, tone.s, tone.l) && !node.glow
        }));
    }
}
