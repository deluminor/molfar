use super::*;

#[test]
fn elapsed_matches_web_boundaries() {
    for (ms, expected) in [
        (-1, "<1m"),
        (0, "<1m"),
        (59_999, "<1m"),
        (60_000, "1m"),
        (3_540_000, "59m"),
        (3_600_000, "1h 0m"),
        (7_500_000, "2h 5m"),
        (90_000_000, "25h 0m"),
    ] {
        assert_eq!(elapsed::label(ms), expected);
    }
}

#[test]
fn intervals_share_domain_preserve_gaps_overlaps_and_stable_order() {
    let chart = layout::calculate(
        &[
            (60_000, Some(120_000)),
            (0, Some(30_000)),
            (60_000, Some(90_000)),
            (150_000, None),
        ],
        180_000,
    );
    assert_eq!(chart.elapsed, 180_000);
    assert_eq!(
        chart
            .lanes
            .iter()
            .map(|lane| lane.index)
            .collect::<Vec<_>>(),
        vec![1, 0, 2, 3]
    );
    assert_eq!(chart.lanes[0].start, 0.0);
    assert_eq!(chart.lanes[1].start, 1.0 / 3.0);
    assert_eq!(chart.lanes[1].width, 1.0 / 3.0);
    assert_eq!(chart.lanes[3].elapsed, 30_000);
}

#[test]
fn empty_zero_reversed_and_extreme_intervals_are_safe() {
    assert!(layout::calculate(&[], 0).lanes.is_empty());
    let chart = layout::calculate(&[(100, Some(0)), (100, Some(100))], 100);
    assert_eq!(chart.elapsed, 0);
    assert_eq!(chart.domain, 60_000);
    assert!(
        chart
            .lanes
            .iter()
            .all(|lane| lane.width == 0.0 && lane.elapsed == 0)
    );
    let chart = layout::calculate(&[(i64::MIN, Some(i64::MAX))], 0);
    assert_eq!(chart.elapsed, u64::MAX as i128);
    assert_eq!(chart.lanes[0].width, 1.0);
}

#[test]
fn injected_clock_moves_only_unfinished_intervals() {
    let intervals = [(0, Some(120_000)), (0, None)];
    let before = layout::calculate(&intervals, 30_000);
    let after = layout::calculate(&intervals, 60_000);
    assert_eq!(before.lanes[0], after.lanes[0]);
    assert!(after.lanes[1].width > before.lanes[1].width);
    assert_eq!(layout::calculate(&[(0, None)], 180_000).domain, 180_000);
}

#[test]
fn reversed_intervals_are_unavailable_and_do_not_expand_valid_bounds() {
    let chart = layout::calculate(&[(0, Some(-100)), (60_000, Some(120_000))], 120_000);
    assert!(!chart.lanes[0].available);
    assert!(chart.lanes[1].available);
    assert_eq!(chart.elapsed, 60_000);
}
