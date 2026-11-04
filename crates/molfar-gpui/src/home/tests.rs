use super::{
    Event, Home,
    layout::{
        model::{DEFAULT_LAYOUT, WidgetId},
        state::LayoutState,
    },
};
use gpui::{
    AppContext, Bounds, Modifiers, MouseButton, TestAppContext, VisualTestContext, WindowBounds,
    WindowHandle, WindowOptions, point, px, size,
};
use serde_json::{Value, json};
use std::{cell::RefCell, rc::Rc};

type Saved = Rc<RefCell<Vec<Value>>>;

fn open(cx: &mut TestAppContext, width: f32, stored: Value) -> (WindowHandle<Home>, Saved) {
    cx.update(|cx| cx.set_reduce_motion(true));
    let window = cx.update(|cx| {
        cx.open_window(
            WindowOptions {
                window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                    point(px(0.), px(0.)),
                    size(px(width), px(900.)),
                ))),
                ..Default::default()
            },
            |_, cx| cx.new(|cx| Home::new(&stored, cx)),
        )
        .unwrap()
    });
    let saved: Saved = Rc::default();
    let home = window.update(cx, |_, _, cx| cx.entity()).unwrap();
    let sink = saved.clone();
    cx.update(|cx| {
        cx.subscribe(&home, move |_, event: &Event, _| {
            if let Event::Layout(value) = event {
                sink.borrow_mut().push(value.clone());
            }
        })
        .detach()
    });
    (window, saved)
}

fn click(visual: &mut VisualTestContext, selector: &'static str) {
    let bounds = visual
        .debug_bounds(selector)
        .unwrap_or_else(|| panic!("{selector}"));
    visual.simulate_click(bounds.center(), Modifiers::none());
    visual.run_until_parked();
}

fn state(window: &WindowHandle<Home>, visual: &mut VisualTestContext) -> LayoutState {
    window
        .update(visual, |home, _, _| home.state.clone())
        .unwrap()
}

#[gpui::test]
fn wide_home_shows_every_widget_on_the_default_grid(cx: &mut TestAppContext) {
    let (window, _) = open(cx, 1400., Value::Null);
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();

    for id in WidgetId::ALL {
        let selector: &'static str = Box::leak(format!("home-card-{}", id.key()).into_boxed_str());
        assert!(visual.debug_bounds(selector).is_some(), "{selector}");
    }
    let clock = visual.debug_bounds("home-card-clock").unwrap();
    let status = visual.debug_bounds("home-card-status").unwrap();
    assert_eq!(clock.top(), status.top());
    assert!(status.left() > clock.right());
}

#[gpui::test]
fn narrow_home_stacks_full_width_and_cannot_edit(cx: &mut TestAppContext) {
    let (window, _) = open(cx, 640., Value::Null);
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();

    let clock = visual.debug_bounds("home-card-clock").unwrap();
    let status = visual.debug_bounds("home-card-status").unwrap();
    assert_eq!(clock.left(), status.left());
    assert_eq!(clock.size.width, status.size.width);
    assert!(status.top() > clock.bottom());

    click(visual, "home-layout-edit");
    window
        .update(visual, |home, _, _| assert!(!home.editing))
        .unwrap();
}

#[gpui::test]
fn hidden_widgets_are_saved_restored_and_reset(cx: &mut TestAppContext) {
    let (window, saved) = open(cx, 1400., json!({"brand": "fire"}));
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();

    click(visual, "home-layout-edit");
    click(visual, "home-hide-clock");

    assert!(visual.debug_bounds("home-card-clock").is_none());
    assert!(visual.debug_bounds("home-show-clock").is_some());
    assert_eq!(saved.borrow().last().unwrap()["hidden"], json!(["clock"]));

    click(visual, "home-show-clock");
    assert!(visual.debug_bounds("home-card-clock").is_some());
    assert_eq!(saved.borrow().last().unwrap()["hidden"], json!([]));

    click(visual, "home-hide-matrix");
    click(visual, "home-layout-reset");
    let reset = state(&window, visual);
    assert!(reset.hidden.is_empty());
    assert_eq!(reset.items, DEFAULT_LAYOUT.to_vec());
    assert_eq!(saved.borrow().last().unwrap()["brand"], json!("fire"));
}

#[gpui::test]
fn dragging_a_card_moves_it_and_pushes_the_rest_down(cx: &mut TestAppContext) {
    let (window, saved) = open(cx, 1400., Value::Null);
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    click(visual, "home-layout-edit");

    let grid = visual.debug_bounds("home-grid").unwrap();
    let grip = visual.debug_bounds("home-move-matrix").unwrap();
    let start = grip.center();
    let lift = point(
        grid.left() + (start.x - grip.left()),
        grid.top() + (start.y - grip.top()),
    );
    visual.simulate_mouse_down(start, MouseButton::Left, Modifiers::none());
    visual.simulate_mouse_move(lift, Some(MouseButton::Left), Modifiers::none());
    visual.run_until_parked();
    assert!(visual.debug_bounds("home-drop-target").is_some());
    visual.simulate_mouse_up(lift, MouseButton::Left, Modifiers::none());
    visual.run_until_parked();

    let moved = state(&window, visual);
    let matrix = moved
        .items
        .iter()
        .find(|item| item.id == WidgetId::Matrix)
        .unwrap();
    assert_eq!((matrix.x, matrix.y), (0, 0));
    assert!(
        moved
            .visible()
            .iter()
            .filter(|item| item.id != WidgetId::Matrix)
            .all(|item| item.y >= matrix.bottom())
    );
    assert_eq!(saved.borrow().len(), 1);
    assert!(visual.debug_bounds("home-drop-target").is_none());
}

#[gpui::test]
fn resizing_stops_at_the_minimum_and_escape_cancels_a_drag(cx: &mut TestAppContext) {
    let (window, saved) = open(cx, 1400., Value::Null);
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    click(visual, "home-layout-edit");

    let corner = visual.debug_bounds("home-resize-host").unwrap().center();
    let host_card = visual.debug_bounds("home-card-host").unwrap();
    let far = point(host_card.left() + px(4.), host_card.top() + px(4.));
    visual.simulate_mouse_down(corner, MouseButton::Left, Modifiers::none());
    visual.simulate_mouse_move(far, Some(MouseButton::Left), Modifiers::none());
    visual.simulate_mouse_up(far, MouseButton::Left, Modifiers::none());
    visual.run_until_parked();
    let host = state(&window, visual)
        .items
        .into_iter()
        .find(|item| item.id == WidgetId::Host)
        .unwrap();
    assert_eq!((host.w, host.h), WidgetId::Host.min_size());

    let before = state(&window, visual);
    let grip = visual.debug_bounds("home-move-usage").unwrap().center();
    visual.simulate_mouse_down(grip, MouseButton::Left, Modifiers::none());
    visual.simulate_mouse_move(
        point(grip.x - px(600.), grip.y),
        Some(MouseButton::Left),
        Modifiers::none(),
    );
    window
        .update(visual, |home, window, cx| window.focus(&home.focus, cx))
        .unwrap();
    visual.simulate_keystrokes("escape");
    visual.run_until_parked();
    assert_eq!(state(&window, visual), before);
    assert_eq!(saved.borrow().len(), 1);
    window
        .update(visual, |home, _, _| {
            assert!(home.drag.is_none());
            assert!(home.editing);
        })
        .unwrap();
}

#[gpui::test]
fn escape_leaves_edit_mode_before_closing_home(cx: &mut TestAppContext) {
    let (window, _) = open(cx, 1400., Value::Null);
    let closed = Rc::new(RefCell::new(false));
    let home = window.update(cx, |_, _, cx| cx.entity()).unwrap();
    let flag = closed.clone();
    cx.update(|cx| {
        cx.subscribe(&home, move |_, event: &Event, _| {
            if matches!(event, Event::Close) {
                *flag.borrow_mut() = true;
            }
        })
        .detach()
    });
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    window
        .update(visual, |home, window, cx| window.focus(&home.focus, cx))
        .unwrap();
    visual.run_until_parked();
    click(visual, "home-layout-edit");
    window
        .update(visual, |home, window, cx| window.focus(&home.focus, cx))
        .unwrap();

    visual.simulate_keystrokes("escape");
    visual.run_until_parked();
    assert!(!*closed.borrow());
    window
        .update(visual, |home, _, _| assert!(!home.editing))
        .unwrap();

    visual.simulate_keystrokes("escape");
    assert!(*closed.borrow());
}
