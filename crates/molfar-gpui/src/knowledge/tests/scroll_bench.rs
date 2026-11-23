use super::*;
use gpui::{ScrollDelta, ScrollWheelEvent};
use std::time::Instant;

const NOTES: usize = 400;
const FRAMES: usize = 40;

fn long_note() -> String {
    let mut text =
        String::from("# Plan\n\n| Day | Date | Topics | Hours |\n| --- | --- | --- | --- |\n");
    for day in 0..40 {
        text.push_str(&format!(
            "| {day} | {day}.12 | [[n{day}]] · [[n{}]] · hub [[n{}]] — pytest and mocking | 5 |\n",
            day + 1,
            day + 2
        ));
    }
    for section in 0..30 {
        text.push_str(&format!(
            "\n## Block {section}\n\n> [!note] Start\n> Moved prep into day one. See [[n{section}]].\n\n1. **Day {section}:** [[n{section}]] → [[n{}]] → `dataclass` and `@property`.\n2. Self-check at the end of each part.\n\n- Functions: positional, keyword, `*args` / `**kwargs`.\n- Exceptions: raise, catch, custom exceptions, `finally`.\n",
            section + 1
        ));
    }
    text
}

fn bench_vault() -> Fixture {
    let note = long_note();
    let mut files: Vec<(String, String)> = (0..NOTES)
        .map(|index| {
            (
                format!("notes/n{index}.md"),
                format!(
                    "Note {index} links [[n{}]] and [[a-plan]]\n",
                    (index + 7) % NOTES
                ),
            )
        })
        .collect();
    files.push(("a-plan.md".into(), note));
    let borrowed: Vec<(&str, &str)> = files
        .iter()
        .map(|(path, body)| (path.as_str(), body.as_str()))
        .collect();
    fixture(&borrowed)
}

fn timed(mut frame: impl FnMut()) -> f64 {
    let start = Instant::now();
    for _ in 0..FRAMES {
        frame();
    }
    start.elapsed().as_secs_f64() * 1000. / FRAMES as f64
}

#[gpui::test]
#[ignore = "benchmark: cargo test --bin molfar-native knowledge_scroll_frame_time -- --ignored --nocapture"]
fn knowledge_scroll_frame_time(cx: &mut TestAppContext) {
    let vault = bench_vault();
    let window = open(cx, vault.data.clone());
    window
        .update(cx, |view, _, cx| view.open_note("a-plan.md".into(), cx))
        .unwrap();
    cx.run_until_parked();
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    let panel = visual
        .debug_bounds("knowledge-preview")
        .expect("note preview");
    let at = panel.center();

    let scroll = timed(|| {
        visual.simulate_event(ScrollWheelEvent {
            position: at,
            delta: ScrollDelta::Pixels(point(px(0.), px(-24.))),
            ..Default::default()
        });
        visual.run_until_parked();
    });
    let graph = window
        .update(visual, |view, _, _| view.graph.clone())
        .unwrap();
    let spin = timed(|| {
        graph.update(visual, |_, cx| cx.notify());
        visual.run_until_parked();
    });
    eprintln!("knowledge: note scroll {scroll:.2} ms/frame, graph frame {spin:.2} ms/frame");
}
