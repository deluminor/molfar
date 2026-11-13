use super::widget_tests::{click, open};
use gpui::{TestAppContext, VisualTestContext};
use molfar_core::{
    consumption::{TokenCounts, UsageRecord, aggregate::DayUsage, summary::UsageSummary},
    store::consumption::{CardRow, ProjectUsage, SessionRow},
};

fn summary(output: u64) -> UsageSummary {
    let record = UsageRecord {
        source_key: "run".into(),
        provider: "codex".into(),
        model_id: Some("gpt-6.1-sol".into()),
        model_name: None,
        started_at_ms: None,
        reported_at_ms: None,
        tokens: Some(TokenCounts {
            output,
            ..Default::default()
        }),
    };
    UsageSummary::of([&record]).unwrap()
}

fn usage() -> ProjectUsage {
    let day = summary(1_000_000);
    ProjectUsage {
        total: day,
        sessions: vec![SessionRow {
            session: 7,
            title: "Ship usage".into(),
            summary: day,
        }],
        cards: vec![CardRow {
            card_id: "card-15".into(),
            number: 15,
            title: "Token usage".into(),
            summary: day,
        }],
        days: vec![DayUsage {
            date: chrono::Local::now().date_naive(),
            summary: day,
        }],
        issues: Vec::new(),
    }
}

#[gpui::test]
fn consumption_widget_opens_top_sessions_and_cards(cx: &mut TestAppContext) {
    let (window, events) = open(cx);
    window
        .update(cx, |home, _, cx| {
            home.feeds.consumption.shown = Some(usage());
            cx.notify();
        })
        .unwrap();
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();

    assert!(visual.debug_bounds("home-consumption").is_some());
    click(visual, "home-consumption-session-7");
    click(visual, "home-consumption-card-card-15");

    assert_eq!(*events.borrow(), ["session 7", "card card-15"]);
}

#[gpui::test]
fn consumption_states_and_sheet_open_and_close(cx: &mut TestAppContext) {
    let (window, events) = open(cx);
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    assert!(visual.debug_bounds("home-consumption").is_none());

    window
        .update(cx, |home, _, cx| {
            home.feeds.consumption.shown = Some(usage());
            home.feeds.consumption.sheet_open = true;
            cx.notify();
        })
        .unwrap();
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    assert!(visual.debug_bounds("home-consumption-sheet").is_some());

    click(visual, "home-consumption-sheet-session-7");

    assert!(visual.debug_bounds("home-consumption-sheet").is_none());
    assert_eq!(*events.borrow(), ["session 7"]);
}
