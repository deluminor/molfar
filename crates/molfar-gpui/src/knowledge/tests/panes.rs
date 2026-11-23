use super::*;
use gpui::{ScrollDelta, ScrollWheelEvent};

fn long_vault() -> Fixture {
    let body = "## Section\n\nA paragraph of note text.\n\n- [ ] a task\n\n".repeat(60);
    fixture(&[("long.md", body.as_str()), ("other.md", "Links [[long]]\n")])
}

fn renders(window: WindowHandle<Knowledge>, cx: &mut VisualTestContext) -> (usize, usize) {
    window
        .update(cx, |view, _, cx| {
            (
                view.tree_pane.read(cx).renders,
                view.note_pane.read(cx).renders,
            )
        })
        .unwrap()
}

fn open_long(cx: &mut TestAppContext) -> (Fixture, WindowHandle<Knowledge>, VisualTestContext) {
    let vault = long_vault();
    let window = open(cx, vault.data.clone());
    window
        .update(cx, |view, _, cx| view.open_note("long.md".into(), cx))
        .unwrap();
    cx.run_until_parked();
    let visual = VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    (vault, window, visual)
}

#[gpui::test]
fn graph_frames_reuse_the_tree_and_note_panes(cx: &mut TestAppContext) {
    let (_vault, window, mut visual) = open_long(cx);
    let before = renders(window, &mut visual);
    let graph = window
        .update(&mut visual, |view, _, _| view.graph.clone())
        .unwrap();

    for _ in 0..5 {
        graph.update(&mut visual, |_, cx| cx.notify());
        visual.run_until_parked();
    }

    assert_eq!(renders(window, &mut visual), before);
}

#[gpui::test]
fn scrolling_the_note_renders_only_the_note_pane(cx: &mut TestAppContext) {
    let (_vault, window, mut visual) = open_long(cx);
    let (tree, note) = renders(window, &mut visual);
    let preview = visual.debug_bounds("knowledge-preview").unwrap();

    visual.simulate_event(ScrollWheelEvent {
        position: preview.center(),
        delta: ScrollDelta::Pixels(point(px(0.), px(-200.))),
        ..Default::default()
    });
    visual.run_until_parked();

    assert_eq!(renders(window, &mut visual), (tree, note + 1));
    assert!(
        visual.debug_bounds("knowledge-task-0").is_none(),
        "first task scrolled away"
    );
}

#[gpui::test]
fn a_note_change_still_reaches_the_note_pane(cx: &mut TestAppContext) {
    let (_vault, window, mut visual) = open_long(cx);
    let (_, note) = renders(window, &mut visual);

    window
        .update(&mut visual, |view, _, cx| {
            view.preview = false;
            cx.notify();
        })
        .unwrap();
    visual.run_until_parked();

    assert!(renders(window, &mut visual).1 > note);
    assert!(visual.debug_bounds("knowledge-source").is_some());
}
