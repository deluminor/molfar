//! How bright each note and link should be, and the eased values actually
//! drawn, so a selection fades in and out instead of snapping. Like the
//! desktop graph: the open note and its direct links stay light, everything
//! else recedes.
use molfar_core::knowledge::GraphProjection;
use std::collections::HashSet;

const IDLE_NODE: f32 = 0.6;
const IDLE_EDGE: f32 = 0.07;
const FOCUS: f32 = 1.;
const NEIGHBOR: f32 = 0.85;
const SECOND: f32 = 0.2;
const REST_NODE: f32 = 0.07;
const LIT_EDGE: f32 = 0.55;
const SECOND_EDGE: f32 = 0.07;
const REST_EDGE: f32 = 0.02;
const HOVER_NODE: f32 = 0.95;
const HOVER_EDGE: f32 = 0.3;
/// Below this every value counts as arrived.
const SETTLED: f32 = 0.004;

#[derive(Clone, Debug, Default, PartialEq)]
pub(super) struct Levels {
    /// Node brightness, 0 to 1.
    pub nodes: Vec<f32>,
    /// Link brightness, 0 to 1, in projection edge order.
    pub edges: Vec<f32>,
    /// Halo and ring strength, 0 to 1.
    pub glow: Vec<f32>,
}

/// Where every value is heading for this selection and hover.
pub(super) fn targets(
    projection: &GraphProjection,
    selected: Option<usize>,
    hovered: Option<usize>,
) -> Levels {
    let count = projection.nodes.len();
    let mut levels = Levels {
        nodes: vec![IDLE_NODE; count],
        edges: vec![IDLE_EDGE; projection.edges.len()],
        glow: vec![0.; count],
    };

    if let Some(focus) = selected.filter(|index| *index < count) {
        let neighbors = projection.neighbors(focus);
        let second: HashSet<usize> = neighbors
            .iter()
            .flat_map(|index| projection.neighbors(*index))
            .collect();
        for (index, level) in levels.nodes.iter_mut().enumerate() {
            *level = if index == focus {
                FOCUS
            } else if neighbors.contains(&index) {
                NEIGHBOR
            } else if second.contains(&index) {
                SECOND
            } else {
                REST_NODE
            };
        }
        for (edge, level) in projection.edges.iter().zip(levels.edges.iter_mut()) {
            *level = if edge.source == focus || edge.target == focus {
                LIT_EDGE
            } else if neighbors.contains(&edge.source) || neighbors.contains(&edge.target) {
                SECOND_EDGE
            } else {
                REST_EDGE
            };
        }
        levels.glow[focus] = 1.;
    }

    if let Some(hover) = hovered.filter(|index| *index < count) {
        levels.nodes[hover] = levels.nodes[hover].max(HOVER_NODE);
        levels.glow[hover] = levels.glow[hover].max(0.45);
        for (edge, level) in projection.edges.iter().zip(levels.edges.iter_mut()) {
            if edge.source == hover || edge.target == hover {
                *level = level.max(HOVER_EDGE);
            }
        }
    }
    levels
}

fn approach(current: &mut Vec<f32>, target: &[f32], blend: f32) -> bool {
    if current.len() != target.len() {
        *current = target.to_vec();
        return false;
    }
    let mut moving = false;
    for (value, goal) in current.iter_mut().zip(target) {
        *value += (goal - *value) * blend;
        if (goal - *value).abs() > SETTLED {
            moving = true;
        } else {
            *value = *goal;
        }
    }
    moving
}

impl Levels {
    /// Moves toward `target` by `blend` (0 to 1). Returns whether anything is
    /// still in motion. A new graph shape adopts the target at once.
    pub(super) fn ease(&mut self, target: &Levels, blend: f32) -> bool {
        let nodes = approach(&mut self.nodes, &target.nodes, blend);
        let edges = approach(&mut self.edges, &target.edges, blend);
        let glow = approach(&mut self.glow, &target.glow, blend);
        nodes || edges || glow
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use molfar_core::knowledge::{GraphEdge, GraphNode};

    fn projection() -> GraphProjection {
        let node = |path: &str| GraphNode {
            path: path.into(),
            title: path.into(),
            group: String::new(),
            degree: 1,
        };
        GraphProjection {
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
        }
    }

    #[test]
    fn the_open_note_and_its_links_stay_light_and_the_rest_recedes() {
        let levels = targets(&projection(), Some(0), None);
        assert_eq!(levels.nodes, [FOCUS, NEIGHBOR, SECOND, REST_NODE]);
        assert_eq!(levels.edges, [LIT_EDGE, SECOND_EDGE]);
        assert_eq!(levels.glow, [1., 0., 0., 0.]);
        let idle = targets(&projection(), None, Some(3));
        assert_eq!(idle.nodes[3], HOVER_NODE);
        assert!(idle.nodes[..3].iter().all(|level| *level == IDLE_NODE));
    }

    #[test]
    fn easing_moves_gradually_and_settles_exactly() {
        let mut current = targets(&projection(), None, None);
        let goal = targets(&projection(), Some(0), None);
        assert!(current.ease(&goal, 0.25));
        assert!(
            current.nodes[3] < IDLE_NODE && current.nodes[3] > REST_NODE,
            "halfway, not snapped"
        );
        for _ in 0..80 {
            current.ease(&goal, 0.25);
        }
        assert!(!current.ease(&goal, 0.25));
        assert_eq!(current, goal);
    }
}
