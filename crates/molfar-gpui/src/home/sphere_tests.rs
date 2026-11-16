use super::{
    layout::model::WidgetId,
    widget_tests::{click, open},
};
use gpui::{Modifiers, TestAppContext, VisualTestContext, point, px};

#[gpui::test]
fn sphere_drag_rotates_in_reduced_motion_and_releases_outside(cx: &mut TestAppContext) {
    use gpui::MouseButton;

    let (window, _) = open(cx);
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    let bounds = visual.debug_bounds("home-brand-sphere").unwrap();
    let start = bounds.center();
    let before = window
        .update(visual, |home, _, _| home.views.sphere_motion.borrow().yaw)
        .unwrap();
    visual.simulate_mouse_down(start, MouseButton::Left, Modifiers::none());
    visual.run_until_parked();
    let outside = point(bounds.left() - px(30.), start.y + px(20.));
    visual.simulate_mouse_move(outside, Some(MouseButton::Left), Modifiers::none());
    visual.run_until_parked();
    window
        .update(visual, |home, _, _| {
            let motion = home.views.sphere_motion.borrow();
            assert!(motion.dragging());
            assert_ne!(motion.yaw, before);
        })
        .unwrap();
    visual.simulate_mouse_up(outside, MouseButton::Left, Modifiers::none());
    visual.run_until_parked();
    window
        .update(visual, |home, _, _| {
            let mut motion = home.views.sphere_motion.borrow_mut();
            assert!(!motion.dragging());
            let before = (motion.yaw, motion.pitch);
            assert_eq!(motion.frame(500., true), before);
        })
        .unwrap();
}

#[gpui::test]
fn sphere_gesture_yields_to_layout_editing_and_cancels_when_hidden(cx: &mut TestAppContext) {
    use gpui::MouseButton;

    let (window, _) = open(cx);
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    click(visual, "home-layout-edit");
    let bounds = visual.debug_bounds("home-brand-sphere").unwrap();
    let start = bounds.center();
    visual.simulate_mouse_down(start, MouseButton::Left, Modifiers::none());
    visual.simulate_mouse_move(
        start + point(px(20.), px(20.)),
        Some(MouseButton::Left),
        Modifiers::none(),
    );
    visual.run_until_parked();
    window
        .update(visual, |home, _, _| {
            let motion = home.views.sphere_motion.borrow();
            assert!(motion.editing);
            assert!(!motion.dragging());
            assert_eq!(motion.yaw, 0.);
        })
        .unwrap();
    visual.simulate_mouse_up(start, MouseButton::Left, Modifiers::none());
    let grip = visual.debug_bounds("home-move-brand").unwrap().center();
    visual.simulate_mouse_down(grip, MouseButton::Left, Modifiers::none());
    visual.simulate_mouse_move(
        grip + point(px(20.), px(20.)),
        Some(MouseButton::Left),
        Modifiers::none(),
    );
    visual.run_until_parked();
    window
        .update(visual, |home, _, _| {
            assert!(home.drag.is_some());
            assert!(!home.views.sphere_motion.borrow().dragging());
        })
        .unwrap();
    visual.simulate_mouse_up(grip, MouseButton::Left, Modifiers::none());
    window
        .update(visual, |home, _, cx| {
            home.finish_editing(cx);
            assert!(home.views.sphere_motion.borrow_mut().press((0., 0.), 0.));
            home.hide_widget(WidgetId::Brand, cx);
            assert!(!home.views.sphere_motion.borrow().dragging());
            home.show_widget(WidgetId::Brand, cx);
            assert!(home.views.sphere_motion.borrow_mut().press((0., 0.), 0.));
            home.conceal();
            assert!(!home.views.sphere_motion.borrow().dragging());
        })
        .unwrap();
}

#[gpui::test]
fn reset_restores_sphere_drag_after_hiding_in_edit_mode(cx: &mut TestAppContext) {
    let (window, _) = open(cx);
    window
        .update(cx, |home, _, cx| {
            home.start_editing(cx);
            home.hide_widget(WidgetId::Brand, cx);
            home.reset_layout(cx);
            assert!(home.editing);
            assert!(!home.views.sphere_motion.borrow_mut().press((0., 0.), 0.));
            home.finish_editing(cx);
            assert!(home.views.sphere_motion.borrow_mut().press((0., 0.), 0.));
        })
        .unwrap();
}
