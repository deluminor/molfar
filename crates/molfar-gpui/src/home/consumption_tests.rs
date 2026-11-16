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
        tier: None,
        tokens: Some(TokenCounts {
            output,
            ..Default::default()
        }),
    };
    UsageSummary::of([&record]).unwrap()
}

pub(super) fn usage() -> ProjectUsage {
    let day = summary(1_000_000);
    ProjectUsage {
        total: day,
        sessions: vec![SessionRow {
            session: 7,
            title: "Ship usage".into(),
            provider: "codex".into(),
            cwd: "/work/molfar".into(),
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

#[gpui::test]
fn consumption_range_switches_without_reloading(cx: &mut TestAppContext) {
    use super::data::consumption::Range;
    let (window, _) = open(cx);
    window
        .update(cx, |home, _, cx| {
            home.feeds.consumption.shown = Some(usage());
            assert_eq!(home.feeds.consumption.range, Range::Month);
            cx.notify();
        })
        .unwrap();
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    click(visual, "home-consumption-year");
    window
        .update(visual, |home, _, _| {
            assert_eq!(home.feeds.consumption.range, Range::Year);
            assert!(home.feeds.consumption.shown.is_some());
        })
        .unwrap();
    click(visual, "home-consumption-month");
    window
        .update(visual, |home, _, _| {
            assert_eq!(home.feeds.consumption.range, Range::Month);
        })
        .unwrap();
}

#[gpui::test]
fn consumption_rankings_show_ten_rows_each(cx: &mut TestAppContext) {
    let (window, _) = open(cx);
    window
        .update(cx, |home, _, cx| {
            let mut data = usage();
            let session = data.sessions[0].clone();
            let card = data.cards[0].clone();
            data.sessions = (1..=11)
                .map(|id| {
                    let mut row = session.clone();
                    row.session = id;
                    row
                })
                .collect();
            data.cards = (1..=11)
                .map(|id| {
                    let mut row = card.clone();
                    row.card_id = format!("rank-{id}");
                    row
                })
                .collect();
            home.feeds.consumption.shown = Some(data);
            cx.notify();
        })
        .unwrap();
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    for id in 1..=10 {
        assert!(
            visual
                .debug_bounds(Box::leak(
                    format!("home-consumption-session-{id}").into_boxed_str()
                ))
                .is_some()
        );
        assert!(
            visual
                .debug_bounds(Box::leak(
                    format!("home-consumption-card-rank-{id}").into_boxed_str()
                ))
                .is_some()
        );
    }
    assert!(visual.debug_bounds("home-consumption-session-11").is_none());
    assert!(
        visual
            .debug_bounds("home-consumption-card-rank-11")
            .is_none()
    );
}
