//! A 3D force layout: Barnes–Hut many-body repulsion, springs along edges and
//! a centring pull.
use super::octree::Octree;
use super::projection::GraphEdge;
use std::sync::atomic::{AtomicBool, Ordering};

pub type Point3 = [f32; 3];

pub const SETTLE_TICKS: usize = 300;
pub const WARM_TICKS: usize = 120;
const LINK_DISTANCE: f32 = 60.;
const REPULSION: f32 = 2_800.;
const CENTER_PULL: f32 = 0.012;
const DAMPING: f32 = 0.6;
const MAX_STEP: f32 = 24.;
/// Live heat a drag adds, and how fast it fades once released.
pub const DRAG_ALPHA: f32 = 0.3;
const LIVE_ALPHA_DECAY: f32 = 0.028;
const LIVE_ALPHA_MIN: f32 = 0.004;

/// Deterministic start: a Fibonacci sphere sized to the node count, so the
/// same vault always opens in the same shape.
fn seed(index: usize, count: usize) -> Point3 {
    let golden = std::f32::consts::PI * (3. - 5f32.sqrt());
    let radius = 60. * (count as f32).cbrt().max(1.);
    let y = 1. - (index as f32 + 0.5) / count.max(1) as f32 * 2.;
    let ring = (1. - y * y).max(0.).sqrt();
    let theta = golden * index as f32;
    [
        theta.cos() * ring * radius,
        y * radius,
        theta.sin() * ring * radius,
    ]
}

fn repel(positions: &[Point3], forces: &mut [Point3], alpha: f32) {
    let tree = Octree::build(positions);
    for (index, force) in forces.iter_mut().enumerate() {
        let push = tree.force(index, REPULSION * alpha);
        for axis in 0..3 {
            force[axis] += push[axis];
        }
    }
}

fn spring(
    positions: &[Point3],
    edges: &[GraphEdge],
    degree: &[usize],
    forces: &mut [Point3],
    alpha: f32,
) {
    for edge in edges {
        let delta = sub(positions[edge.target], positions[edge.source]);
        let length = dot(delta, delta).sqrt().max(0.01);
        let strength = 1. / degree[edge.source].min(degree[edge.target]).max(1) as f32;
        let pull = (length - LINK_DISTANCE) / length * alpha * strength * 0.5;
        for axis in 0..3 {
            forces[edge.source][axis] += delta[axis] * pull;
            forces[edge.target][axis] -= delta[axis] * pull;
        }
    }
}

/// A live force simulation. Batch layouts run it on a fixed cooling
/// schedule off the UI thread; the view also ticks it per frame while a note
/// is dragged, so its neighbours follow and the graph springs back.
#[derive(Clone, Debug)]
pub struct Simulation {
    positions: Vec<Point3>,
    velocities: Vec<Point3>,
    edges: Vec<GraphEdge>,
    degree: Vec<usize>,
    alpha: f32,
}

impl Simulation {
    pub fn new(count: usize, edges: &[GraphEdge], previous: &[Option<Point3>]) -> Self {
        let positions = (0..count)
            .map(|index| {
                previous
                    .get(index)
                    .copied()
                    .flatten()
                    .unwrap_or_else(|| seed(index, count))
            })
            .collect();
        let mut degree = vec![0usize; count];
        for edge in edges {
            degree[edge.source] += 1;
            degree[edge.target] += 1;
        }
        Self {
            positions,
            velocities: vec![[0.; 3]; count],
            edges: edges.to_vec(),
            degree,
            alpha: 0.,
        }
    }

    pub fn positions(&self) -> &[Point3] {
        &self.positions
    }

    /// Whether the simulation has cooled enough to stop ticking.
    pub fn settled(&self) -> bool {
        self.alpha < LIVE_ALPHA_MIN
    }

    /// Warms the simulation to at least `alpha`.
    pub fn reheat(&mut self, alpha: f32) {
        self.alpha = self.alpha.max(alpha);
    }

    /// One live tick that cools as it goes. A pinned node sits at its point
    /// and drags its links along.
    pub fn tick(&mut self, pinned: Option<(usize, Point3)>) {
        self.step(self.alpha, pinned);
        self.alpha *= 1. - LIVE_ALPHA_DECAY;
    }

    fn step(&mut self, alpha: f32, pinned: Option<(usize, Point3)>) {
        let count = self.positions.len();
        let mut forces = vec![[0f32; 3]; count];
        repel(&self.positions, &mut forces, alpha);
        spring(
            &self.positions,
            &self.edges,
            &self.degree,
            &mut forces,
            alpha,
        );
        for (index, point) in self.positions.iter_mut().enumerate() {
            for axis in 0..3 {
                forces[index][axis] -= point[axis] * CENTER_PULL * alpha;
                let velocity = ((self.velocities[index][axis] + forces[index][axis]) * DAMPING)
                    .clamp(-MAX_STEP, MAX_STEP);
                self.velocities[index][axis] = velocity;
                point[axis] += velocity;
            }
        }
        if let Some((index, target)) = pinned.filter(|(index, _)| *index < count) {
            self.positions[index] = target;
            self.velocities[index] = [0.; 3];
        }
    }
}

/// Settles `count` nodes. `previous` warm-starts nodes already placed, so a
/// filter change moves the graph instead of rebuilding it. Returns `None`
/// once `cancel` is set, so a superseded layout stops between ticks.
pub fn settle(
    count: usize,
    edges: &[GraphEdge],
    previous: &[Option<Point3>],
    ticks: usize,
    cancel: &AtomicBool,
) -> Option<Vec<Point3>> {
    let mut simulation = Simulation::new(count, edges, previous);
    for tick in 0..ticks {
        if cancel.load(Ordering::Relaxed) {
            return None;
        }
        simulation.step(1. - tick as f32 / ticks.max(1) as f32, None);
    }

    recenter(&mut simulation.positions);
    Some(simulation.positions)
}

fn recenter(positions: &mut [Point3]) {
    if positions.is_empty() {
        return;
    }
    let mut center = [0f32; 3];
    for point in positions.iter() {
        for axis in 0..3 {
            center[axis] += point[axis] / positions.len() as f32;
        }
    }
    for point in positions.iter_mut() {
        *point = sub(*point, center);
    }
}

pub(super) fn sub(left: Point3, right: Point3) -> Point3 {
    [left[0] - right[0], left[1] - right[1], left[2] - right[2]]
}

pub(super) fn dot(left: Point3, right: Point3) -> f32 {
    left[0] * right[0] + left[1] * right[1] + left[2] * right[2]
}
