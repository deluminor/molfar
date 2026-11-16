use super::{geometry, presentation};
use crate::home::data::activity;
use chrono::NaiveDate;
use gpui::{
    AppContext, Bounds, Context, Render, TestAppContext, VisualTestContext, Window, WindowBounds,
    WindowOptions, div, point, prelude::*, px, size,
};

struct MonthHeaderFixture;

impl Render for MonthHeaderFixture {
    fn render(&mut self, _: &mut Window, _: &mut Context<Self>) -> impl IntoElement {
        let today = NaiveDate::from_ymd_opt(2026, 11, 4).unwrap();
        let year = activity::year(&[], 2026, today);
        let observed = geometry::observed_range(&year.weeks, today, year.weeks.len());
        let layout = geometry::layout(observed.len(), 1420., 140.);
        let range = geometry::observed_range(&year.weeks, today, layout.fit.weeks);
        div()
            .size_full()
            .flex()
            .gap_3()
            .child(presentation::month_header(&year.weeks[range], layout.fit))
            .child(presentation::summary(0, 0, 0, 0, true))
    }
}

#[gpui::test]
fn month_header_has_room_for_one_line_at_wide_screenshot_size(cx: &mut TestAppContext) {
    cx.update(|cx| cx.set_reduce_motion(true));
    let window = cx
        .update(|cx| {
            cx.open_window(
                WindowOptions {
                    window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                        point(px(0.), px(0.)),
                        size(px(1500.), px(600.)),
                    ))),
                    ..Default::default()
                },
                |_, cx| cx.new(|_| MonthHeaderFixture),
            )
        })
        .unwrap();
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    let label = visual
        .debug_bounds("home-month-0")
        .expect("month header rendered");
    let header = visual
        .debug_bounds("home-month-header")
        .expect("fixed-height header");
    assert_eq!(header.size.height, px(16.));
    let mut previous_right = header.origin.x;
    for index in 0..53 {
        let selector: &'static str = Box::leak(format!("home-month-{index}").into_boxed_str());
        if let Some(month) = visual.debug_bounds(selector) {
            assert!(month.origin.x >= previous_right);
            assert!(month.origin.x + month.size.width <= header.origin.x + header.size.width);
            assert_eq!(month.size.height, header.size.height);
            previous_right = month.origin.x + month.size.width;
        }
    }
    let summary = visual
        .debug_bounds("home-activity-summary")
        .expect("wide summary rail");
    assert!(summary.origin.x >= header.origin.x + header.size.width);
    assert!(
        label.size.width >= px(27.),
        "month name must fit on one line: {label:?}"
    );
    assert!(
        label.size.height <= px(16.),
        "month header must remain one line: {label:?}"
    );
}
