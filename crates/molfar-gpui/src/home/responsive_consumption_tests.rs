use super::{
    consumption_tests::usage, data::consumption::Range, layout::model::WidgetId, widget_tests::open,
};
use chrono::Datelike;
use gpui::{TestAppContext, VisualTestContext, px, size};

#[gpui::test]
fn consumption_labels_fit_short_and_tall_widgets_without_mutating_layout(cx: &mut TestAppContext) {
    let (window, _) = open(cx);
    for (rows, range) in [
        (4, Range::Month),
        (4, Range::Year),
        (8, Range::Month),
        (8, Range::Year),
    ] {
        window
            .update(cx, |home, _, cx| {
                home.feeds.consumption.shown = Some(usage());
                home.feeds.consumption.range = range;
                home.state.hidden = WidgetId::ALL
                    .into_iter()
                    .filter(|id| *id != WidgetId::Consumption)
                    .collect();
                let item = home
                    .state
                    .items
                    .iter_mut()
                    .find(|item| item.id == WidgetId::Consumption)
                    .unwrap();
                item.x = 0;
                item.y = 0;
                item.w = 12;
                item.h = rows;
                cx.notify();
            })
            .unwrap();
        let saved = window.update(cx, |home, _, _| home.state.clone()).unwrap();
        for width in [480., 900., 1400., 2800.] {
            cx.simulate_window_resize(window.into(), size(px(width), px(1200.)));
            let visual = &mut VisualTestContext::from_window(window.into(), cx);
            visual.run_until_parked();
            let widget = visual.debug_bounds("home-consumption").unwrap();
            let today = chrono::Local::now();
            let index = match range {
                Range::Month => today.day() - 1,
                Range::Year => today.month() - 1,
            };
            let selector = Box::leak(format!("home-consumption-axis-{index}").into_boxed_str());
            let label = visual.debug_bounds(selector).unwrap();
            assert!(
                label.bottom() <= widget.bottom(),
                "width={width} rows={rows}: {label:?} outside {widget:?}"
            );
            assert!(label.left() >= widget.left());
            assert!(label.right() <= widget.right());
            window
                .update(visual, |home, _, _| assert_eq!(home.state, saved))
                .unwrap();
        }
    }
}
