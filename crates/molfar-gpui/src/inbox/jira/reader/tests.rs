use std::path::PathBuf;

use gpui::AppContext;
use molfar_core::jira::Issue;

use super::JiraReader;
use crate::inbox::jira::actions::DESCRIPTION_WARNING;

#[gpui::test]
fn cancel_sends_nothing_and_description_confirm_names_the_replacement(
    cx: &mut gpui::TestAppContext,
) {
    cx.update(|cx| {
        let reader = cx.new(|cx| JiraReader::new(PathBuf::from("/tmp/jira-reader"), cx));
        reader.update(cx, |reader, cx| {
            reader.issue = Some(Issue {
                key: "TB-1".into(),
                summary: "Ship".into(),
                description: "Body".into(),
                ..Issue::default()
            });
            let issue = reader.issue.clone().unwrap();
            reader.fill_fields(&issue, cx);
            reader.begin_edit(cx);
            assert!(
                !reader
                    .pending_prompt()
                    .unwrap()
                    .contains(DESCRIPTION_WARNING)
            );
            reader
                .description_input
                .update(cx, |input, cx| input.set_text("Replacement".into(), cx));
            reader.begin_edit(cx);
            let prompt = reader.pending_prompt().unwrap();
            assert!(prompt.contains("TB-1"));
            assert!(prompt.contains(DESCRIPTION_WARNING));
            reader.offline = true;
            reader.insert_issue(false, cx);
            assert_eq!(reader.error.as_deref(), Some("offline: Jira is offline"));
            reader.offline = false;
            reader.begin_comment("Ship it".into());
            reader.confirm(cx);
            assert!(reader.pending.is_none());
            assert!(reader.writing);
            reader.cancel();
            assert!(reader.pending.is_none());
            assert_eq!(reader.writes, 0);
            reader.finish_write(Ok(()), cx);
            assert!(reader.loading);
            assert_eq!(reader.writes, 1);
        });
    });
}

fn long_issue() -> Issue {
    let description =
        "## Goal\n\nScore signals and feed the backtester.\n\n- Read candles\n- Emit orders\n\n"
            .repeat(40);
    Issue {
        key: "TB-2".into(),
        summary: "Long".into(),
        description,
        comments: (0..40)
            .map(|index| molfar_core::jira::issue::Comment {
                id: index.to_string(),
                author: format!("Author {index}"),
                created: String::new(),
                body: format!("Comment {index}\n\nWith a second paragraph."),
            })
            .collect(),
        ..Issue::default()
    }
}

fn reader_window(
    cx: &mut gpui::TestAppContext,
) -> (gpui::WindowHandle<JiraReader>, gpui::VisualTestContext) {
    use gpui::{Bounds, WindowBounds, WindowOptions, point, px, size};
    let window = cx.update(|cx| {
        cx.open_window(
            WindowOptions {
                window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                    point(px(0.), px(0.)),
                    size(px(900.), px(700.)),
                ))),
                ..Default::default()
            },
            |_, cx| cx.new(|cx| JiraReader::new(PathBuf::from("/tmp/jira-reader"), cx)),
        )
        .unwrap()
    });
    window
        .update(cx, |reader, _, cx| {
            reader.show_issue(long_issue(), cx);
            cx.notify();
        })
        .unwrap();
    let visual = gpui::VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    (window, visual)
}

fn wheel(visual: &mut gpui::VisualTestContext, delta: f32) {
    let body = visual.debug_bounds("jira-reader-body").unwrap();
    visual.simulate_event(gpui::ScrollWheelEvent {
        position: body.center(),
        delta: gpui::ScrollDelta::Pixels(gpui::point(gpui::px(0.), gpui::px(delta))),
        ..Default::default()
    });
    visual.run_until_parked();
}

#[gpui::test]
fn a_long_issue_lays_out_only_what_is_on_screen(cx: &mut gpui::TestAppContext) {
    let (_, mut visual) = reader_window(cx);
    assert!(visual.debug_bounds("jira-details").is_some());
    assert!(visual.debug_bounds("jira-comment").is_none());

    for _ in 0..200 {
        wheel(&mut visual, -400.);
    }

    assert!(visual.debug_bounds("jira-details").is_none());
    assert!(visual.debug_bounds("jira-comment").is_some());
}

#[gpui::test]
#[ignore = "benchmark: cargo test --bin molfar-native jira_scroll_frame_time -- --ignored --nocapture"]
fn jira_scroll_frame_time(cx: &mut gpui::TestAppContext) {
    const FRAMES: usize = 40;
    let (_, mut visual) = reader_window(cx);
    let start = std::time::Instant::now();
    for _ in 0..FRAMES {
        wheel(&mut visual, -24.);
    }
    let ms = start.elapsed().as_secs_f64() * 1000. / FRAMES as f64;
    eprintln!("jira reader scroll {ms:.2} ms/frame");
}
