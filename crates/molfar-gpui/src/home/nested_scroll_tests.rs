use gpui::{
    Context, IntoElement, Render, ScrollDelta, ScrollHandle, ScrollWheelEvent, TestAppContext,
    Window, div, point, prelude::*, px, size,
};
use std::{cell::Cell, rc::Rc};

struct Nested {
    observed: Rc<Cell<usize>>,
    outer: ScrollHandle,
    inner: ScrollHandle,
}
impl Render for Nested {
    fn render(&mut self, _: &mut Window, _: &mut Context<Self>) -> impl IntoElement {
        let observed = self.observed.clone();
        div()
            .id("outer")
            .size_full()
            .overflow_scroll()
            .track_scroll(&self.outer)
            .child(
                div().w(px(500.)).h(px(600.)).child(
                    div()
                        .id("inner")
                        .on_scroll_wheel(move |_, _, _| observed.set(observed.get() + 1))
                        .w(px(100.))
                        .h(px(100.))
                        .overflow_scroll()
                        .track_scroll(&self.inner)
                        .child(div().w(px(400.)).h(px(400.))),
                ),
            )
    }
}

#[gpui::test]
fn nested_wheel_is_consumed_until_child_boundary(cx: &mut TestAppContext) {
    let cx = cx.add_empty_window();
    let observed = Rc::new(Cell::new(0));
    let outer = ScrollHandle::new();
    let inner = ScrollHandle::new();
    let draw = |cx: &mut gpui::VisualTestContext| {
        cx.draw(point(px(0.), px(0.)), size(px(200.), px(200.)), |_, cx| {
            cx.new(|_| Nested {
                observed: observed.clone(),
                outer: outer.clone(),
                inner: inner.clone(),
            })
            .into_any_element()
        });
    };
    draw(cx);
    for delta in [point(-20., 0.), point(0., -20.), point(-20., -20.)] {
        outer.set_offset(point(px(0.), px(0.)));
        inner.set_offset(point(px(0.), px(0.)));
        draw(cx);
        cx.simulate_event(ScrollWheelEvent {
            position: point(px(10.), px(10.)),
            delta: ScrollDelta::Pixels(delta.map(px)),
            ..Default::default()
        });
        assert_ne!(inner.offset(), point(px(0.), px(0.)));
        assert_eq!(outer.offset(), point(px(0.), px(0.)));
    }
    assert_eq!(observed.get(), 3);
    inner.set_offset(point(px(-300.), px(-300.)));
    draw(cx);
    cx.simulate_event(ScrollWheelEvent {
        position: point(px(10.), px(10.)),
        delta: ScrollDelta::Pixels(point(px(0.), px(-25.))),
        ..Default::default()
    });
    assert_eq!(outer.offset().y, px(-25.));
    outer.set_offset(point(px(0.), px(0.)));
    draw(cx);
    cx.simulate_event(ScrollWheelEvent {
        position: point(px(10.), px(10.)),
        delta: ScrollDelta::Pixels(point(px(0.), px(25.))),
        ..Default::default()
    });
    assert_eq!(outer.offset().y, px(0.));
    assert_eq!(inner.offset().y, px(-275.));
}
