//! Barnes–Hut octree: distant clusters repel as one mass, so a tick costs
//! O(n log n) instead of O(n²).
use super::layout::{dot, sub, Point3};

const THETA_SQUARED: f32 = 0.81;
const MAX_DEPTH: u8 = 24;

struct Cell {
    center: Point3,
    half: f32,
    mass: f32,
    mass_center: Point3,
    point: Option<usize>,
    children: [u32; 8],
}

const NONE: u32 = u32::MAX;

pub(super) struct Octree<'a> {
    cells: Vec<Cell>,
    positions: &'a [Point3],
}

impl<'a> Octree<'a> {
    pub(super) fn build(positions: &'a [Point3]) -> Self {
        let mut extent = 1f32;
        for point in positions {
            for value in point {
                extent = extent.max(value.abs());
            }
        }
        let mut tree = Self {
            cells: vec![Cell::new([0.; 3], extent * 1.01)],
            positions,
        };
        for index in 0..positions.len() {
            tree.insert(0, index, 0);
        }
        tree.summarise(0);
        tree
    }

    fn insert(&mut self, cell: usize, index: usize, depth: u8) {
        let leaf = self.cells[cell].children.iter().all(|child| *child == NONE);
        if leaf {
            match self.cells[cell].point {
                None if self.cells[cell].mass == 0. => {
                    self.cells[cell].point = Some(index);
                    self.cells[cell].mass = 1.;
                    return;
                }
                Some(existing) if depth < MAX_DEPTH => {
                    self.cells[cell].point = None;
                    self.descend(cell, existing, depth);
                }
                _ => {
                    self.cells[cell].mass += 1.;
                    return;
                }
            }
        }
        self.descend(cell, index, depth);
    }

    fn descend(&mut self, cell: usize, index: usize, depth: u8) {
        let point = self.positions[index];
        let (center, half) = (self.cells[cell].center, self.cells[cell].half);
        let octant = (point[0] >= center[0]) as usize
            | ((point[1] >= center[1]) as usize) << 1
            | ((point[2] >= center[2]) as usize) << 2;
        if self.cells[cell].children[octant] == NONE {
            let quarter = half / 2.;
            let offset = |bit: usize, axis: usize| {
                if octant & bit != 0 {
                    center[axis] + quarter
                } else {
                    center[axis] - quarter
                }
            };
            let child = Cell::new([offset(1, 0), offset(2, 1), offset(4, 2)], quarter);
            self.cells.push(child);
            self.cells[cell].children[octant] = (self.cells.len() - 1) as u32;
        }
        let child = self.cells[cell].children[octant] as usize;
        self.insert(child, index, depth + 1);
    }

    fn summarise(&mut self, cell: usize) -> (f32, Point3) {
        if let Some(point) = self.cells[cell].point {
            let mass = self.cells[cell].mass;
            self.cells[cell].mass_center = self.positions[point];
            return (mass, self.positions[point]);
        }
        let mut mass = 0.;
        let mut weighted = [0f32; 3];
        for octant in 0..8 {
            let child = self.cells[cell].children[octant];
            if child == NONE {
                continue;
            }
            let (child_mass, child_center) = self.summarise(child as usize);
            mass += child_mass;
            for axis in 0..3 {
                weighted[axis] += child_center[axis] * child_mass;
            }
        }
        if mass > 0. {
            for value in &mut weighted {
                *value /= mass;
            }
        }
        self.cells[cell].mass = mass;
        self.cells[cell].mass_center = weighted;
        (mass, weighted)
    }

    /// The repulsive force on `index` with `strength` per unit mass.
    pub(super) fn force(&self, index: usize, strength: f32) -> Point3 {
        let mut force = [0f32; 3];
        let mut stack = vec![0usize];
        let point = self.positions[index];
        while let Some(cell) = stack.pop() {
            let node = &self.cells[cell];
            if node.mass == 0. || node.point == Some(index) && node.mass <= 1. {
                continue;
            }
            let delta = sub(point, node.mass_center);
            let squared = dot(delta, delta).max(1.);
            let size = node.half * 2.;
            let leaf = node.children.iter().all(|child| *child == NONE);
            let holds_point =
                (0..3).all(|axis| (point[axis] - node.center[axis]).abs() <= node.half);
            if leaf || !holds_point && size * size / squared < THETA_SQUARED {
                let mass = if node.point == Some(index) {
                    node.mass - 1.
                } else {
                    node.mass
                };
                let push = strength * mass / squared;
                let length = squared.sqrt();
                for axis in 0..3 {
                    force[axis] += delta[axis] / length * push;
                }
                continue;
            }
            stack.extend(
                node.children
                    .iter()
                    .filter(|child| **child != NONE)
                    .map(|child| *child as usize),
            );
        }
        force
    }
}

impl Cell {
    fn new(center: Point3, half: f32) -> Self {
        Self {
            center,
            half,
            mass: 0.,
            mass_center: center,
            point: None,
            children: [NONE; 8],
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn octree_force_matches_the_exact_sum_for_nearby_points() {
        let positions = [
            [0., 0., 0.],
            [10., 0., 0.],
            [0., 12., 0.],
            [0., 0., -9.],
            [10., 0., 0.],
        ];
        let tree = Octree::build(&positions);
        for index in 0..positions.len() {
            let mut exact = [0f32; 3];
            for (other, point) in positions.iter().enumerate() {
                if other == index {
                    continue;
                }
                let delta = sub(positions[index], *point);
                let squared = dot(delta, delta).max(1.);
                for axis in 0..3 {
                    exact[axis] += delta[axis] / squared.sqrt() * 100. / squared;
                }
            }
            let approximate = tree.force(index, 100.);
            for axis in 0..3 {
                assert!((exact[axis] - approximate[axis]).abs() < 0.05 * exact[axis].abs().max(1.));
            }
        }
    }

    #[test]
    fn a_node_never_repels_itself_through_a_distant_cluster() {
        let positions = [
            [-99., -99., -99.],
            [99., 99., 99.],
            [98., 99., 99.],
            [99., 98., 99.],
        ];
        let tree = Octree::build(&positions);
        let mut exact = [0f32; 3];
        for point in &positions[1..] {
            let delta = sub(positions[0], *point);
            let squared = dot(delta, delta).max(1.);
            for axis in 0..3 {
                exact[axis] += delta[axis] / squared.sqrt() * 100. / squared;
            }
        }
        let approximate = tree.force(0, 100.);
        for axis in 0..3 {
            assert!((exact[axis] - approximate[axis]).abs() <= 0.05 * exact[axis].abs());
        }
    }
}
