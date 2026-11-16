#[derive(Debug, PartialEq)]
pub(super) struct Lane {
    pub index: usize,
    pub available: bool,
    pub start: f32,
    pub width: f32,
    pub elapsed: i128,
}

pub(super) struct Layout {
    pub lanes: Vec<Lane>,
    pub elapsed: i128,
    pub domain: i128,
}

pub(super) fn calculate(intervals: &[(i64, Option<i64>)], now: i64) -> Layout {
    let origin = intervals
        .iter()
        .filter(|(start, end)| end.unwrap_or(now) >= *start)
        .map(|(start, _)| *start)
        .min()
        .unwrap_or(now) as i128;
    let end = intervals
        .iter()
        .filter(|(start, end)| end.unwrap_or(now) >= *start)
        .map(|(_, end)| end.unwrap_or(now) as i128)
        .max()
        .unwrap_or(origin);
    let elapsed = end - origin;
    let domain = elapsed.max(60_000);
    let mut lanes: Vec<_> = intervals
        .iter()
        .enumerate()
        .map(|(index, (start, end))| {
            let available = end.unwrap_or(now) >= *start;
            let duration = (end.unwrap_or(now) as i128 - *start as i128).max(0);
            Lane {
                index,
                available,
                start: if available {
                    ((*start as i128 - origin) as f64 / domain as f64) as f32
                } else {
                    0.
                },
                width: (duration as f64 / domain as f64) as f32,
                elapsed: duration,
            }
        })
        .collect();
    lanes.sort_by_key(|lane| intervals[lane.index].0);
    Layout {
        lanes,
        elapsed,
        domain,
    }
}
