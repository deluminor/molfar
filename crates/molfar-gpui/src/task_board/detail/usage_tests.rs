use super::tests::show;
use gpui::{TestAppContext, VisualTestContext};
use molfar_core::consumption::{
    TokenCounts, UsageRecord,
    aggregate::{CardUsage, RunUsage},
    summary::UsageSummary,
};

fn summary(tokens: Option<u64>) -> UsageSummary {
    let record = UsageRecord {
        source_key: "run".into(),
        provider: "codex".into(),
        model_id: Some("gpt-6.1-sol".into()),
        model_name: None,
        started_at_ms: None,
        reported_at_ms: None,
        tier: None,
        tokens: tokens.map(|output| TokenCounts {
            output,
            ..Default::default()
        }),
    };
    UsageSummary::of([&record]).unwrap()
}

fn run(id: &str, tokens: Option<u64>) -> RunUsage {
    RunUsage {
        run_id: id.into(),
        stage: "implement".into(),
        attempt: 1,
        harness: "codex".into(),
        model: "gpt-6.1-sol".into(),
        status: "failed".into(),
        summary: summary(tokens),
    }
}

#[gpui::test]
fn overview_shows_card_total_and_every_attempt_including_unreported(cx: &mut TestAppContext) {
    let window = show(cx, false);
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    assert!(visual.debug_bounds("board-usage").is_none());

    window
        .update(cx, |board, _, cx| {
            let mut total = summary(Some(1_000));
            total.merge(&summary(None)).unwrap();
            board.card_usage.set_for_test(
                board.selected.clone().unwrap(),
                CardUsage {
                    total,
                    runs: vec![run("reported", Some(1_000)), run("interrupted", None)],
                    other: UsageSummary::default(),
                },
            );
            cx.notify();
        })
        .unwrap();
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();

    assert!(visual.debug_bounds("board-usage").is_some());
    assert!(visual.debug_bounds("board-usage-run-reported").is_some());
    assert!(visual.debug_bounds("board-usage-run-interrupted").is_some());
    assert!(visual.debug_bounds("board-usage-other").is_none());
}
