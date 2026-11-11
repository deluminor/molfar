use gpui::{
    Context, IntoElement, Render, ScrollDelta, ScrollHandle, ScrollWheelEvent, TestAppContext,
    Window, div, point, prelude::*, px, size,
};

struct WideBlockInColumn {
    column: ScrollHandle,
    wide: ScrollHandle,
}

impl Render for WideBlockInColumn {
    fn render(&mut self, _: &mut Window, _: &mut Context<Self>) -> impl IntoElement {
        let wide_row = div()
            .id("wide")
            .w_full()
            .h(px(60.))
            .overflow_x_scroll()
            .track_scroll(&self.wide)
            .child(div().w(px(400.)).h(px(40.)));

        div()
            .id("column")
            .size_full()
            .overflow_y_scroll()
            .track_scroll(&self.column)
            .child(wide_row)
            .child(div().w_full().h(px(400.)))
    }
}

fn draw(cx: &mut gpui::VisualTestContext, column: &ScrollHandle, wide: &ScrollHandle) {
    let (column, wide) = (column.clone(), wide.clone());
    cx.draw(point(px(0.), px(0.)), size(px(100.), px(100.)), |_, cx| {
        cx.new(|_| WideBlockInColumn { column, wide }).into_any_element()
    });
}

fn wheel(cx: &mut gpui::VisualTestContext, delta: ScrollDelta) {
    cx.simulate_event(ScrollWheelEvent {
        position: point(px(10.), px(10.)),
        delta,
        ..Default::default()
    });
}

#[gpui::test]
fn vertical_wheel_over_wide_block_scrolls_only_the_column(cx: &mut TestAppContext) {
    let cx = cx.add_empty_window();
    let (column, wide) = (ScrollHandle::new(), ScrollHandle::new());
    draw(cx, &column, &wide);

    wheel(cx, ScrollDelta::Pixels(point(px(0.), px(-30.))));
    draw(cx, &column, &wide);

    assert_eq!(wide.offset().x, px(0.));
    assert_eq!(column.offset().y, px(-30.));
}

#[gpui::test]
fn horizontal_wheel_over_wide_block_pans_only_the_block(cx: &mut TestAppContext) {
    let cx = cx.add_empty_window();
    let (column, wide) = (ScrollHandle::new(), ScrollHandle::new());
    draw(cx, &column, &wide);

    wheel(cx, ScrollDelta::Pixels(point(px(-30.), px(0.))));
    draw(cx, &column, &wide);

    assert_eq!(wide.offset().x, px(-30.));
    assert_eq!(column.offset().y, px(0.));
}
