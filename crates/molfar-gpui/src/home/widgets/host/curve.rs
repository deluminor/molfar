/// Pixels between two points of a drawn curve: dense enough to read as smooth.
const STEP_PX: f32 = 1.5;
/// Pressure change that starts a new stroke color.
const COLOR_STEP: f32 = 0.05;

/// A monotone cubic (Fritsch–Carlson) through `points`, sampled every
/// [`STEP_PX`]. It never overshoots the samples, so a 0–100% line stays in range
/// and a flat run stays flat. `points` are in pixels with increasing x.
pub(super) fn smooth(points: &[(f32, f32)]) -> Vec<(f32, f32)> {
    if points.len() < 3 {
        return points.to_vec();
    }
    let slopes: Vec<f32> = points
        .windows(2)
        .map(|pair| {
            let dx = pair[1].0 - pair[0].0;
            if dx > 0. {
                (pair[1].1 - pair[0].1) / dx
            } else {
                0.
            }
        })
        .collect();
    let tangents = tangents(&slopes);

    let mut output = vec![points[0]];
    for (index, pair) in points.windows(2).enumerate() {
        let ((x0, y0), (x1, y1)) = (pair[0], pair[1]);
        let dx = x1 - x0;
        let steps = (dx / STEP_PX).ceil().max(1.) as usize;
        for step in 1..=steps {
            let t = step as f32 / steps as f32;
            let (t2, t3) = (t * t, t * t * t);
            let y = (2. * t3 - 3. * t2 + 1.) * y0
                + (t3 - 2. * t2 + t) * dx * tangents[index]
                + (-2. * t3 + 3. * t2) * y1
                + (t3 - t2) * dx * tangents[index + 1];
            output.push((x0 + dx * t, y));
        }
    }
    output
}

fn tangents(slopes: &[f32]) -> Vec<f32> {
    let mut tangents = Vec::with_capacity(slopes.len() + 1);
    tangents.push(slopes[0]);
    for pair in slopes.windows(2) {
        let (before, after) = (pair[0], pair[1]);
        tangents.push(if before * after <= 0. {
            0.
        } else {
            2. / (1. / before + 1. / after)
        });
    }
    tangents.push(slopes[slopes.len() - 1]);
    tangents
}

/// Splits a curve into runs that share one pressure color, each run sharing its
/// first point with the previous one so strokes meet without a seam.
pub(super) fn color_runs<T: Copy>(points: &[T], pressure: impl Fn(T) -> f32) -> Vec<(f32, Vec<T>)> {
    let mut runs: Vec<(f32, Vec<T>)> = Vec::new();
    for &point in points {
        let band = (pressure(point).clamp(0., 1.) / COLOR_STEP).round() * COLOR_STEP;
        match runs.last_mut() {
            Some((current, run)) if *current == band => run.push(point),
            Some((_, run)) => {
                let joint = run[run.len() - 1];
                runs.push((band, vec![joint, point]));
            }
            None => runs.push((band, vec![point])),
        }
    }
    runs
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn smoothing_passes_through_samples_without_overshoot() {
        let points = [(0., 10.), (10., 90.), (20., 90.), (30., 0.), (40., 40.)];
        let curve = smooth(&points);

        for point in points {
            assert!(curve.iter().any(
                |sample| (sample.0 - point.0).abs() < 1e-3 && (sample.1 - point.1).abs() < 1e-3
            ));
        }
        assert!(curve.iter().all(|(_, y)| (0. ..=90.).contains(y)));
        assert!(curve.windows(2).all(|pair| pair[1].0 > pair[0].0));
        assert!(
            curve
                .windows(2)
                .all(|pair| pair[1].0 - pair[0].0 <= STEP_PX + 1e-3)
        );
    }

    #[test]
    fn flat_runs_stay_flat() {
        let curve = smooth(&[(0., 50.), (10., 50.), (20., 50.), (30., 80.)]);
        assert!(
            curve
                .iter()
                .filter(|(x, _)| *x <= 20.)
                .all(|(_, y)| (*y - 50.).abs() < 1e-3)
        );
    }

    #[test]
    fn steady_pressure_is_one_stroke_and_changes_join_seamlessly() {
        let calm = color_runs(&[0.1_f32, 0.12, 0.11], |value| value);
        assert_eq!(calm.len(), 1);

        let rising = color_runs(&[0.1_f32, 0.5, 0.95], |value| value);
        assert_eq!(rising.len(), 3);
        assert_eq!(rising[1].1, vec![0.1, 0.5]);
        assert_eq!(rising[2].1, vec![0.5, 0.95]);
    }
}
