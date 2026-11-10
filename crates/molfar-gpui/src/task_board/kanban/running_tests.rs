use super::running::{outline_length, outline_point};
use crate::task_board::tests::{card, window};
use gpui::{TestAppContext, VisualTestContext};
use molfar_core::task_board::{
    constants::BACKLOG,
    stage::lifecycle::constants::{FAILED, RUNNING},
    types::Snapshot,
};

const W: f32 = 200.;
const H: f32 = 100.;
const R: f32 = 12.;

fn close(a: (f32, f32), b: (f32, f32)) -> bool {
    (a.0 - b.0).abs() < 0.01 && (a.1 - b.1).abs() < 0.01
}

#[test]
fn outline_walks_every_edge_and_wraps_around() {
    let length = outline_length(W, H, R);
    let arc = std::f32::consts::FRAC_PI_2 * R;

    assert!(close(outline_point(W, H, R, 0.), (R, 0.)));
    assert!(close(outline_point(W, H, R, W - 2. * R), (W - R, 0.)));
    assert!(close(outline_point(W, H, R, W - 2. * R + arc), (W, R)));
    assert!(close(outline_point(W, H, R, length / 2.), (W - R, H)));
    assert!(close(
        outline_point(W, H, R, length),
        outline_point(W, H, R, 0.)
    ));
    assert!(close(
        outline_point(W, H, R, -1.),
        outline_point(W, H, R, length - 1.)
    ));
}

#[test]
fn outline_never_jumps_between_neighbouring_samples() {
    let length = outline_length(W, H, R);
    let samples = 2_000;
    let mut previous = outline_point(W, H, R, 0.);
    for index in 1..=samples {
        let next = outline_point(W, H, R, length * index as f32 / samples as f32);
        let gap = ((next.0 - previous.0).powi(2) + (next.1 - previous.1).powi(2)).sqrt();
        assert!(
            gap <= length / samples as f32 + 0.01,
            "gap {gap} at {index}"
        );
        assert!((0. ..=W).contains(&next.0) && (0. ..=H).contains(&next.1));
        previous = next;
    }
}

#[gpui::test]
fn only_running_cards_get_the_animated_border_and_spinner(cx: &mut TestAppContext) {
    let window = window(cx);
    let mut running = card("live", BACKLOG);
    running.run_state = RUNNING.into();
    let mut failed = card("broken", BACKLOG);
    failed.run_state = FAILED.into();
    window
        .update(cx, |board, _, cx| {
            board.finish(
                board.revision,
                Ok(Snapshot {
                    cards: vec![running, failed],
                    ..Default::default()
                }),
                cx,
            );
        })
        .unwrap();
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();

    let card = visual.debug_bounds("board-card-live").unwrap();
    let border = visual.debug_bounds("board-card-running-live").unwrap();
    assert_eq!(border, card);
    assert!(visual.debug_bounds("board-card-spinner-live").is_some());
    assert!(visual.debug_bounds("board-card-running-broken").is_none());
    assert!(visual.debug_bounds("board-card-spinner-broken").is_none());
}
