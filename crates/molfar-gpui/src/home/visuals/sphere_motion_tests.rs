use super::*;

fn thrown() -> Motion {
    let mut motion = Motion::default();
    motion.press((0., 0.), 0.);
    motion.moved((20., 10.), 0.05);
    motion.release(0.05, false);
    motion
}

fn flick(motion: &mut Motion, frames: i32) {
    motion.press((0., 0.), 0.);
    for step in 1..=frames {
        let t = step as f32 / 60.;
        motion.moved((step as f32 * 18., step as f32 * 4.), t);
        motion.frame(t, false);
    }
    motion.release(frames as f32 / 60., false);
}

#[test]
fn drag_rotates_immediately_with_bounded_angles_and_speed() {
    let mut motion = Motion::default();
    motion.press((0., 0.), 0.);
    motion.moved((1000., 1000.), 0.001);
    assert!((0. ..TAU).contains(&motion.yaw));
    assert_eq!(motion.pitch, -PITCH_LIMIT);
    assert!(motion.velocity.0.abs() <= MAX_SPEED);
    motion.release(0.01, false);
    assert!(!motion.dragging());
}

#[test]
fn inertia_is_frame_rate_independent_and_damps() {
    let mut a = thrown();
    let mut b = thrown();
    for step in 1..=30 {
        a.frame(0.05 + step as f32 / 30., false);
    }
    for step in 1..=60 {
        b.frame(0.05 + step as f32 / 60., false);
    }
    assert!((a.yaw - b.yaw).abs() < 0.0001);
    assert!((a.pitch - b.pitch).abs() < 0.0001);
    assert!(a.velocity.0.abs() < 0.1);
}

#[test]
fn reduced_motion_allows_direct_drag_but_no_idle_or_inertia() {
    let mut motion = thrown();
    motion.release(0.06, true);
    let before = motion.frame(0.06, true);
    assert_eq!(motion.frame(0.1, true), before);
    assert!(motion.press((0., 0.), 0.1));
    motion.moved((10., 0.), 0.12);
    assert_ne!(motion.yaw, before.0);
    motion.release(0.12, true);
    let before = motion.frame(0.12, true);
    assert_eq!(motion.frame(0.14, true), before);
    assert_eq!(motion.heat(), 0.);
}

#[test]
fn editing_hidden_gaps_and_stationary_release_do_not_spin() {
    let mut motion = thrown();
    motion.set_editing(true);
    assert!(!motion.animate());
    assert!(!motion.press((0., 0.), 0.1));
    motion.set_editing(false);
    motion.pause();
    assert!(!motion.press((0., 0.), 0.1));
    motion.resume();
    assert!(motion.animate());
    let particle_time = motion.particle_time;
    let before = (motion.yaw, motion.pitch);
    assert_eq!(motion.frame(500., false), before);
    assert_eq!(motion.particle_time, particle_time);
    assert_eq!(motion.heat(), 0.);
    motion.press((0., 0.), 500.);
    motion.moved((20., 0.), 500.05);
    motion.release(501., false);
    assert_eq!(motion.velocity, (0., 0.));
}

#[test]
fn idle_and_a_small_nudge_stay_cold() {
    let mut motion = Motion::default();
    for step in 1..=30 {
        motion.frame(step as f32 / 30., false);
    }
    assert_eq!(motion.heat(), 0.);

    motion.press((0., 0.), 1.);
    motion.moved((3., 0.), 1.05);
    motion.frame(1.05, false);
    assert_eq!(motion.heat(), 0.);
    motion.release(1.05, false);
}

#[test]
fn a_flick_heats_ahead_of_the_spin_and_then_cools() {
    let mut motion = Motion::default();
    flick(&mut motion, 12);
    let hot = motion.heat();
    assert!(hot > 0.55, "heat {hot} should be visible after a flick");
    assert!(
        motion.spin().0 < -0.5,
        "horizontal flick latches a yaw direction"
    );

    let mut heat_when_slow = None;
    for step in 1..=240 {
        motion.frame(12. / 60. + step as f32 / 60., false);
        let speed = motion.velocity.0.hypot(motion.velocity.1);
        if heat_when_slow.is_none() && speed < 0.3 {
            heat_when_slow = Some(motion.heat());
        }
    }
    let held = heat_when_slow.expect("spin should decay");
    assert!(held > 0.2, "heat {held} should outlast the spin");
    assert!(
        motion.heat() < 0.05,
        "heat should cool off {}",
        motion.heat()
    );
}

#[test]
fn cancel_drops_heat_immediately() {
    let mut motion = Motion::default();
    flick(&mut motion, 12);
    assert!(motion.heat() > 0.5);
    motion.cancel();
    assert_eq!(motion.heat(), 0.);
    assert_eq!(motion.spin(), (0., 0.));
}
