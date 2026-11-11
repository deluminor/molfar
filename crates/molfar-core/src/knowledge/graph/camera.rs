use super::layout::{dot, Point3};

/// Vertical field of view in radians.
pub const FIELD_OF_VIEW: f32 = 0.9;
pub const MIN_DISTANCE: f32 = 40.;
pub const MAX_DISTANCE: f32 = 6_000.;
const PITCH_LIMIT: f32 = 1.45;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Camera {
    pub yaw: f32,
    pub pitch: f32,
    pub distance: f32,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Projected {
    pub x: f32,
    pub y: f32,
    /// Distance from the eye along the view axis; larger is farther.
    pub depth: f32,
    /// Screen pixels per world unit at this depth.
    pub scale: f32,
}

impl Default for Camera {
    fn default() -> Self {
        Self {
            yaw: 0.6,
            pitch: 0.35,
            distance: 600.,
        }
    }
}

impl Camera {
    pub fn orbit(&mut self, yaw: f32, pitch: f32) {
        self.yaw += yaw;
        self.pitch = (self.pitch + pitch).clamp(-PITCH_LIMIT, PITCH_LIMIT);
    }

    /// The distance that frames every point in a `height`-tall viewport.
    pub fn fit_distance(points: &[Point3], width: f32, height: f32) -> f32 {
        let radius = points
            .iter()
            .map(|point| dot(*point, *point).sqrt())
            .fold(0f32, f32::max)
            .max(20.);
        let aspect = (width / height.max(1.)).min(1.);
        let half = (FIELD_OF_VIEW / 2.).tan() * aspect;
        (radius / half * 1.15 + radius).clamp(MIN_DISTANCE, MAX_DISTANCE)
    }

    /// Projects a world point into a viewport centred at its middle. Points
    /// behind the eye return `None`.
    pub fn project(&self, point: Point3, width: f32, height: f32) -> Option<Projected> {
        let (sin_yaw, cos_yaw) = self.yaw.sin_cos();
        let (sin_pitch, cos_pitch) = self.pitch.sin_cos();
        let x = point[0] * cos_yaw - point[2] * sin_yaw;
        let z = point[0] * sin_yaw + point[2] * cos_yaw;
        let y = point[1] * cos_pitch - z * sin_pitch;
        let z = point[1] * sin_pitch + z * cos_pitch;
        let depth = self.distance - z;
        if depth <= 1. {
            return None;
        }
        let focal = height / 2. / (FIELD_OF_VIEW / 2.).tan();
        let scale = focal / depth;
        Some(Projected {
            x: width / 2. + x * scale,
            y: height / 2. - y * scale,
            depth,
            scale,
        })
    }
}

impl Camera {
    /// The world point under screen `(x, y)` at `depth` from the eye: the
    /// inverse of [`Camera::project`], used to drag a node in its plane.
    pub fn unproject(&self, x: f32, y: f32, depth: f32, width: f32, height: f32) -> Point3 {
        let focal = height / 2. / (FIELD_OF_VIEW / 2.).tan();
        let scale = focal / depth.max(1.);
        let (sin_yaw, cos_yaw) = self.yaw.sin_cos();
        let (sin_pitch, cos_pitch) = self.pitch.sin_cos();
        let view_x = (x - width / 2.) / scale;
        let view_y = (height / 2. - y) / scale;
        let view_z = self.distance - depth;
        let world_y = view_y * cos_pitch + view_z * sin_pitch;
        let turned_z = -view_y * sin_pitch + view_z * cos_pitch;
        [
            view_x * cos_yaw + turned_z * sin_yaw,
            world_y,
            -view_x * sin_yaw + turned_z * cos_yaw,
        ]
    }
}

/// The nearest-to-eye node whose disc contains the point.
pub fn pick(projected: &[Option<Projected>], radii: &[f32], x: f32, y: f32) -> Option<usize> {
    projected
        .iter()
        .enumerate()
        .filter_map(|(index, item)| {
            let item = item.as_ref()?;
            let radius = radii.get(index).copied().unwrap_or(0.).max(6.);
            let (dx, dy) = (item.x - x, item.y - y);
            (dx * dx + dy * dy <= radius * radius).then_some((index, item.depth))
        })
        .min_by(|left, right| left.1.total_cmp(&right.1))
        .map(|(index, _)| index)
}
