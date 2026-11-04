use super::{
    Event, Home,
    data::feeds::Load,
    layout::{model::WidgetId, state::BrandVisual},
};
use gpui::{
    AppContext, Bounds, Modifiers, TestAppContext, VisualTestContext, WindowBounds, WindowHandle,
    WindowOptions, point, px, size,
};
use molfar_core::{automations::Automation, host::HostStats, store::Session};
use serde_json::Value;
use std::{cell::RefCell, rc::Rc};

type Events = Rc<RefCell<Vec<String>>>;

pub(super) fn open(cx: &mut TestAppContext) -> (WindowHandle<Home>, Events) {
    cx.update(|cx| cx.set_reduce_motion(true));
    let window = cx.update(|cx| {
        cx.open_window(
            WindowOptions {
                window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                    point(px(0.), px(0.)),
                    size(px(1400.), px(1200.)),
                ))),
                ..Default::default()
            },
            |_, cx| cx.new(|cx| Home::new(&Value::Null, cx)),
        )
        .unwrap()
    });
    let events: Events = Rc::default();
    let home = window.update(cx, |_, _, cx| cx.entity()).unwrap();
    let sink = events.clone();
    cx.update(|cx| {
        cx.subscribe(&home, move |_, event: &Event, _| {
            sink.borrow_mut().push(match event {
                Event::OpenSession(id) => format!("session {id}"),
                Event::OpenAutomation(id) => format!("automation {id}"),
                Event::OpenInbox(key) => format!("inbox {key:?}"),
                Event::Layout(value) => format!("layout {}", value["brand"]),
                Event::Close => "close".into(),
            })
        })
        .detach()
    });
    (window, events)
}

fn session(id: i64, title: &str) -> Session {
    Session {
        id,
        title: title.into(),
        provider: "claude".into(),
        cwd: "/work/molfar".into(),
        provider_id: None,
        has_messages: true,
        updated_at: molfar_core::time::now_ms() - id as u64 * 1000,
        archived: false,
        pinned: false,
        work_item: None,
    }
}

fn automation(id: &str, enabled: bool) -> Automation {
    serde_json::from_value(serde_json::json!({
        "id": id, "name": format!("Job {id}"), "prompt": "", "harness": "codex", "model": "",
        "cwd": "/work", "workspaceMode": "local", "reuseSession": false, "runtimeMode": "auto",
        "scheduleKind": "daily", "minute": 0, "time": "09:00", "dayOfWeek": 0,
        "missedRunGraceMinutes": 0, "enabled": enabled,
        "nextRunAt": molfar_core::time::now_ms() as i64 + 3_600_000,
        "createdAt": 1, "updatedAt": 1
    }))
    .unwrap()
}

pub(super) fn click(visual: &mut VisualTestContext, selector: &str) {
    let selector: &'static str = Box::leak(selector.to_owned().into_boxed_str());
    let bounds = visual
        .debug_bounds(selector)
        .unwrap_or_else(|| panic!("{selector}"));
    visual.simulate_click(bounds.center(), Modifiers::none());
    visual.run_until_parked();
}

#[gpui::test]
fn record_widgets_list_and_open_what_they_show(cx: &mut TestAppContext) {
    let (window, events) = open(cx);
    window
        .update(cx, |home, _, cx| {
            home.feeds.sessions =
                Load::Ready(vec![session(1, "Plan Home"), session(2, "Fix Board")]);
            home.feeds.automations =
                Load::Ready(vec![automation("nightly", true), automation("off", false)]);
            cx.notify();
        })
        .unwrap();
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();

    assert!(visual.debug_bounds("home-session-2").is_some());
    click(visual, "home-session-1");
    click(visual, "home-automation-nightly");
    assert!(visual.debug_bounds("home-automation-off").is_some());

    let today = chrono::Local::now().date_naive();
    let day: &'static str = Box::leak(format!("home-day-{today}").into_boxed_str());
    assert!(visual.debug_bounds(day).is_some());
    assert_eq!(*events.borrow(), ["session 1", "automation nightly"]);
}

#[gpui::test]
fn failed_records_show_no_rows(cx: &mut TestAppContext) {
    let (window, _) = open(cx);
    window
        .update(cx, |home, _, cx| {
            home.feeds.sessions = Load::Failed("Sessions are unavailable".into());
            home.feeds.automations = Load::Failed("Automations are unavailable".into());
            cx.notify();
        })
        .unwrap();
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();

    assert!(visual.debug_bounds("home-session-1").is_none());
    assert!(visual.debug_bounds("home-card-sessions").is_some());
}

#[gpui::test]
fn brand_is_sphere_only_without_selector(cx: &mut TestAppContext) {
    let (window, events) = open(cx);
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    assert!(visual.debug_bounds("home-brand-sphere").is_some());
    assert!(visual.debug_bounds("home-brand-pick-sphere").is_none());
    assert!(visual.debug_bounds("home-brand-orb").is_none());
    window
        .update(visual, |home, _, _| {
            assert_eq!(home.state.brand, BrandVisual::Sphere);
        })
        .unwrap();
    assert!(events.borrow().is_empty());
}

#[gpui::test]
fn host_shows_samples_and_is_not_sampled_while_hidden(cx: &mut TestAppContext) {
    let (window, _) = open(cx);
    window
        .update(cx, |home, _, cx| {
            home.feeds.host.push(Ok(HostStats {
                cpu_percent: Some(42.),
                memory_percent: 61.,
                cpu_count: 10,
                ..Default::default()
            }));
            home.state.hide(WidgetId::Host);
            home.sample_host(cx);
            cx.notify();
        })
        .unwrap();
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();

    window
        .update(visual, |home, _, _| {
            assert_eq!(home.feeds.host.history.len(), 1);
            assert_eq!(home.feeds.host.latest.unwrap().cpu_count, 10);
        })
        .unwrap();
    assert!(visual.debug_bounds("home-card-host").is_none());
    assert!(visual.debug_bounds("home-clock").is_some());
    assert!(visual.debug_bounds("home-matrix").is_some());
}

#[gpui::test]
fn polling_runs_only_while_home_is_shown(cx: &mut TestAppContext) {
    use super::data::feeds::{HOST_INTERVAL, Sources};

    let (window, _) = open(cx);
    window
        .update(cx, |home, _, cx| {
            home.set_sources(Sources::default(), cx);
            home.reveal(cx);
        })
        .unwrap();
    cx.run_until_parked();
    let samples = |cx: &mut TestAppContext| {
        window
            .update(cx, |home, _, _| home.feeds.host.history.len())
            .unwrap()
    };
    let shown = samples(cx);

    cx.executor().advance_clock(HOST_INTERVAL);
    cx.run_until_parked();
    assert!(samples(cx) > shown);

    window.update(cx, |home, _, _| home.conceal()).unwrap();
    let hidden = samples(cx);
    cx.executor().advance_clock(HOST_INTERVAL * 3);
    cx.run_until_parked();
    assert_eq!(samples(cx), hidden);
}

#[gpui::test]
fn hiding_home_or_host_invalidates_cpu_baseline(cx: &mut TestAppContext) {
    let (window, _) = open(cx);
    window
        .update(cx, |home, _, cx| {
            home.feeds.host.reset_baseline = false;
            home.conceal();
            assert!(home.feeds.host.reset_baseline);
            home.reveal(cx);
            home.feeds.host.reset_baseline = false;
            home.hide_widget(WidgetId::Host, cx);
            assert!(home.feeds.host.reset_baseline);
            home.feeds.host.reset_baseline = false;
            home.show_widget(WidgetId::Host, cx);
            assert!(home.feeds.host.reset_baseline);
        })
        .unwrap();
}
