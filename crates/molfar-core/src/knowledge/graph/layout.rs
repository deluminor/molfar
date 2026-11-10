//! A 3D force layout: Barnes–Hut many-body repulsion, springs along edges and
//! a centring pull. It runs off the UI thread; the view only interpolates and
//! rotates the result.
use super::octree::Octree;
use super::projection::GraphEdge;

pub type Point3 = [f32; 3];

pub const SETTLE_TICKS: usize = 300;
pub const WARM_TICKS: usize = 120;
const LINK_DISTANCE: f32 = 34.;
const REPULSION: f32 = 900.;
const CENTER_PULL: f32 = 0.012;
const DAMPING: f32 = 0.6;
const MAX_STEP: f32 = 24.;

/// Deterministic start: a Fibonacci sphere sized to the node count, so the
/// same vault always opens in the same shape.
fn seed(index: usize, count: usize) -> Point3 {
    let golden = std::f32::consts::PI * (3. - 5f32.sqrt());
    let radius = 12. * (count as f32).cbrt().max(1.) * 3.;
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

/// Settles `count` nodes. `previous` warm-starts nodes already placed, so a
/// filter change moves the graph instead of rebuilding it.
pub fn settle(
    count: usize,
    edges: &[GraphEdge],
    previous: &[Option<Point3>],
    ticks: usize,
) -> Vec<Point3> {
    let mut positions: Vec<Point3> = (0..count)
        .map(|index| {
            previous
                .get(index)
                .copied()
                .flatten()
                .unwrap_or_else(|| seed(index, count))
        })
        .collect();
    let mut velocities = vec![[0f32; 3]; count];
    let mut degree = vec![0usize; count];
    for edge in edges {
        degree[edge.source] += 1;
        degree[edge.target] += 1;
    }

    for tick in 0..ticks {
        let alpha = 1. - tick as f32 / ticks.max(1) as f32;
        let mut forces = vec![[0f32; 3]; count];
        repel(&positions, &mut forces, alpha);
        spring(&positions, edges, &degree, &mut forces, alpha);
        for (index, point) in positions.iter_mut().enumerate() {
            for axis in 0..3 {
                forces[index][axis] -= point[axis] * CENTER_PULL * alpha;
                let velocity = ((velocities[index][axis] + forces[index][axis]) * DAMPING)
                    .clamp(-MAX_STEP, MAX_STEP);
                velocities[index][axis] = velocity;
                point[axis] += velocity;
            }
        }
    }

    recenter(&mut positions);
    positions
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
