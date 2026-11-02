use gpui::{
    Context, FollowMode, IntoElement, ListAlignment, ListOffset, ListState, Render, ScrollDelta,
    ScrollWheelEvent, TestAppContext, Window, div, list, point, prelude::*, px, size,
};

struct Rows(ListState);
impl Render for Rows {
    fn render(&mut self, _: &mut Window, _: &mut Context<Self>) -> impl IntoElement {
        list(self.0.clone(), |_, _, _| {
            div().h(px(20.)).w_full().into_any()
        })
        .w_full()
        .h_full()
    }
}

fn draw(cx: &mut gpui::VisualTestContext, state: &ListState) {
    cx.draw(point(px(0.), px(0.)), size(px(100.), px(100.)), |_, cx| {
        cx.new(|_| Rows(state.clone())).into_any_element()
    });
}

#[gpui::test]
fn pending_wheel_must_not_cancel_jump_to_bottom(cx: &mut TestAppContext) {
    let cx = cx.add_empty_window();
    let state = ListState::new(50, ListAlignment::Bottom, px(10.)).measure_all();
    state.scroll_to(ListOffset {
        item_ix: 20,
        offset_in_item: px(0.),
    });
    draw(cx, &state);
    cx.simulate_event(ScrollWheelEvent {
        position: point(px(1.), px(1.)),
        delta: ScrollDelta::Lines(point(0., 3.)),
        ..Default::default()
    });
    state.set_follow_mode(FollowMode::Tail);
    state.scroll_to_end();
    draw(cx, &state);
    std::thread::sleep(std::time::Duration::from_millis(5));
    cx.update(|window, cx| {
        window.simulate_next_frame(cx);
    });
    assert!(
        state.is_following_tail(),
        "old wheel input cancelled the jump to bottom"
    );
}

#[gpui::test]
fn pending_wheel_must_not_survive_reset(cx: &mut TestAppContext) {
    let cx = cx.add_empty_window();
    let state = ListState::new(50, ListAlignment::Top, px(10.)).measure_all();
    state.scroll_to(ListOffset {
        item_ix: 20,
        offset_in_item: px(0.),
    });
    draw(cx, &state);
    cx.simulate_event(ScrollWheelEvent {
        position: point(px(1.), px(1.)),
        delta: ScrollDelta::Lines(point(0., -3.)),
        ..Default::default()
    });
    state.reset(50);
    draw(cx, &state);
    std::thread::sleep(std::time::Duration::from_millis(5));
    cx.update(|window, cx| {
        window.simulate_next_frame(cx);
    });
    assert_eq!(state.logical_scroll_top().offset_in_item, px(0.));
    assert_eq!(state.logical_scroll_top().item_ix, 0);
}

#[gpui::test]
fn wheel_glide_must_preserve_input_distance(cx: &mut TestAppContext) {
    let cx = cx.add_empty_window();
    let state = ListState::new(50, ListAlignment::Top, px(10.)).measure_all();
    draw(cx, &state);
    cx.simulate_event(ScrollWheelEvent {
        position: point(px(1.), px(1.)),
        delta: ScrollDelta::Lines(point(0., -10.)),
        ..Default::default()
    });
    for _ in 0..35 {
        std::thread::sleep(std::time::Duration::from_millis(16));
        cx.update(|window, cx| {
            window.simulate_next_frame(cx);
        });
    }
    let offset = state.scroll_px_offset_for_scrollbar();
    assert_eq!(offset.x, px(0.));
    // Eased steps can land one f32 ULP below a row boundary.
    assert!(
        (offset.y - px(-200.)).abs() < px(0.001),
        "wheel input distance changed: {offset:?}"
    );
}

#[gpui::test]
fn new_wheel_after_reset_uses_the_new_bottom_anchor(cx: &mut TestAppContext) {
    let cx = cx.add_empty_window();
    let state = ListState::new(50, ListAlignment::Bottom, px(10.)).measure_all();
    state.scroll_to(ListOffset {
        item_ix: 20,
        offset_in_item: px(0.),
    });
    draw(cx, &state);
    let wheel = ScrollWheelEvent {
        position: point(px(1.), px(1.)),
        delta: ScrollDelta::Lines(point(0., 3.)),
        ..Default::default()
    };
    cx.simulate_event(wheel.clone());
    state.reset(50);
    draw(cx, &state);
    cx.simulate_event(wheel);
    std::thread::sleep(std::time::Duration::from_millis(5));
    cx.update(|window, cx| {
        window.simulate_next_frame(cx);
    });
    let position = state.scroll_px_offset_for_scrollbar().y;
    assert!(
        position < px(-840.),
        "new input used a stale list anchor: {position:?}"
    );
    assert!(
        position > px(-900.),
        "new input was discarded: {position:?}"
    );
}

#[gpui::test]
fn explicit_positions_supersede_pending_wheel_input(cx: &mut TestAppContext) {
    type ScrollAction = fn(&ListState);

    let actions: [(&str, ScrollAction); 6] = [
        ("scroll to", |s| {
            s.scroll_to(ListOffset {
                item_ix: 10,
                offset_in_item: px(0.),
            })
        }),
        ("scroll by", |s| s.scroll_by(px(40.))),
        ("reveal", |s| s.scroll_to_reveal_item(30)),
        ("scrollbar offset", |s| {
            s.set_offset_from_scrollbar(point(px(0.), px(-200.)))
        }),
        ("scrollbar drag", |s| s.scrollbar_drag_started()),
        ("tail", |s| s.set_follow_mode(FollowMode::Tail)),
    ];
    for (name, action) in actions {
        let cx = cx.add_empty_window();
        let state = ListState::new(50, ListAlignment::Bottom, px(10.)).measure_all();
        state.scroll_to(ListOffset {
            item_ix: 20,
            offset_in_item: px(0.),
        });
        draw(cx, &state);
        cx.simulate_event(ScrollWheelEvent {
            position: point(px(1.), px(1.)),
            delta: ScrollDelta::Lines(point(0., 3.)),
            ..Default::default()
        });
        action(&state);
        draw(cx, &state);
        let expected = state.scroll_px_offset_for_scrollbar();
        std::thread::sleep(std::time::Duration::from_millis(5));
        cx.update(|window, cx| {
            window.simulate_next_frame(cx);
        });
        assert_eq!(state.scroll_px_offset_for_scrollbar(), expected, "{name}");
    }
}

#[gpui::test]
fn reversing_at_the_bottom_uses_the_current_anchor(cx: &mut TestAppContext) {
    let cx = cx.add_empty_window();
    let state = ListState::new(50, ListAlignment::Bottom, px(10.)).measure_all();
    state.scroll_to(ListOffset {
        item_ix: 20,
        offset_in_item: px(0.),
    });
    draw(cx, &state);
    cx.simulate_event(ScrollWheelEvent {
        position: point(px(1.), px(1.)),
        delta: ScrollDelta::Lines(point(0., -1000.)),
        ..Default::default()
    });
    std::thread::sleep(std::time::Duration::from_millis(5));
    cx.update(|window, cx| {
        window.simulate_next_frame(cx);
    });
    assert_eq!(state.is_scrolled_to_end(), Some(true));
    draw(cx, &state);
    cx.simulate_event(ScrollWheelEvent {
        position: point(px(1.), px(1.)),
        delta: ScrollDelta::Lines(point(0., 3.)),
        ..Default::default()
    });
    std::thread::sleep(std::time::Duration::from_millis(5));
    cx.update(|window, cx| {
        window.simulate_next_frame(cx);
    });
    let position = state.scroll_px_offset_for_scrollbar().y;
    assert!(
        position < px(-840.),
        "reversal reused the old anchor: {position:?}"
    );
    assert!(
        position > px(-900.),
        "reversal input was discarded: {position:?}"
    );
}
