use super::*;
use gpui::{
    AppContext, Bounds, TestAppContext, VisualTestContext, WindowBounds, WindowHandle,
    WindowOptions, point, px, size,
};
use molfar_core::knowledge::{GraphEdge, GraphNode};
use std::cell::RefCell;

fn projection(paths: &[&str], edges: &[(usize, usize)]) -> GraphProjection {
    GraphProjection {
        nodes: paths
            .iter()
            .map(|path| GraphNode {
                path: (*path).into(),
                title: (*path).into(),
                group: String::new(),
                degree: 1,
            })
            .collect(),
        edges: edges
            .iter()
            .map(|(source, target)| GraphEdge {
                source: *source,
                target: *target,
            })
            .collect(),
        ..Default::default()
    }
}

fn open(cx: &mut TestAppContext) -> WindowHandle<GraphView> {
    cx.update(|cx| cx.set_reduce_motion(true));
    let window = cx.update(|cx| {
        cx.open_window(
            WindowOptions {
                window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                    point(px(0.), px(0.)),
                    size(px(800.), px(600.)),
                ))),
                ..Default::default()
            },
            |_, cx| cx.new(|_| GraphView::new()),
        )
        .unwrap()
    });
    cx.run_until_parked();
    window
}

#[gpui::test]
fn a_projection_lays_out_off_thread_and_identical_scans_keep_the_layout(cx: &mut TestAppContext) {
    let window = open(cx);
    window
        .update(cx, |graph, _, cx| {
            graph.set_projection(projection(&["a", "b", "c"], &[(0, 1)]), cx);
            assert!(graph.pending.is_some());
        })
        .unwrap();
    cx.run_until_parked();
    let generation = window
        .update(cx, |graph, _, cx| {
            assert!(graph.pending.is_none());
            assert_eq!(graph.shown.nodes.len(), 3);
            assert_eq!(graph.positions.len(), 3);
            graph.set_projection(projection(&["a", "b", "c"], &[(0, 1)]), cx);
            assert!(
                graph.pending.is_none(),
                "an identical projection does not re-layout"
            );
            graph.generation
        })
        .unwrap();
    window
        .update(cx, |graph, _, cx| {
            graph.set_projection(projection(&["a", "b"], &[(0, 1)]), cx);
            assert_eq!(graph.generation, generation + 1);
        })
        .unwrap();
    cx.run_until_parked();
    window
        .update(cx, |graph, _, _| assert_eq!(graph.shown.nodes.len(), 2))
        .unwrap();
}

#[gpui::test]
fn clicking_selects_dragging_a_note_pulls_it_and_dragging_space_orbits(cx: &mut TestAppContext) {
    let window = open(cx);
    let events = Rc::new(RefCell::new(Vec::new()));
    let sink = events.clone();
    window
        .update(cx, |graph, _, cx| {
            graph.spinning = false;
            graph.set_projection(projection(&["a", "b"], &[(0, 1)]), cx);
            cx.subscribe_self(move |_, event: &GraphEvent, _| {
                if let GraphEvent::Select(path) = event {
                    sink.borrow_mut().push(path.clone());
                }
            })
            .detach();
        })
        .unwrap();
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    window
        .update(visual, |_, window, _| window.refresh())
        .unwrap();
    visual.run_until_parked();

    let (target, yaw) = window
        .update(visual, |graph, _, _| {
            let origin = graph.bounds.get().origin;
            let node = graph.projected[1].expect("node b is on screen");
            (origin + point(px(node.x), px(node.y)), graph.camera.yaw)
        })
        .unwrap();
    visual.simulate_click(target, Default::default());
    visual.run_until_parked();
    assert_eq!(events.borrow().as_slice(), ["b"]);

    let pulled = target + point(px(80.), px(0.));
    visual.simulate_mouse_down(target, gpui::MouseButton::Left, Default::default());
    visual.simulate_mouse_move(pulled, Some(gpui::MouseButton::Left), Default::default());
    visual.run_until_parked();
    window
        .update(visual, |graph, _, _| {
            let node = graph.projected[1].unwrap();
            let under = graph.bounds.get().origin + point(px(node.x), px(node.y));
            assert!(
                (under.x - pulled.x).abs() < px(1.),
                "the note stays under the cursor"
            );
            assert_eq!(graph.camera.yaw, yaw, "dragging a note does not orbit");
            assert!(graph.simulating());
        })
        .unwrap();
    visual.simulate_mouse_up(pulled, gpui::MouseButton::Left, Default::default());
    visual.run_until_parked();

    let corner = window
        .update(visual, |graph, _, _| {
            graph.bounds.get().origin + point(px(6.), px(6.))
        })
        .unwrap();
    visual.simulate_mouse_down(corner, gpui::MouseButton::Left, Default::default());
    visual.simulate_mouse_move(
        corner + point(px(80.), px(0.)),
        Some(gpui::MouseButton::Left),
        Default::default(),
    );
    visual.simulate_mouse_up(
        corner + point(px(80.), px(0.)),
        gpui::MouseButton::Left,
        Default::default(),
    );
    visual.run_until_parked();
    window
        .update(visual, |graph, _, _| {
            assert!(
                graph.camera.yaw != yaw,
                "dragging empty space orbits the camera"
            );
            assert_eq!(graph.selected.as_deref(), Some("b"));
        })
        .unwrap();
    assert_eq!(events.borrow().len(), 1, "a drag is not a click");
}

#[gpui::test]
fn pressing_a_control_over_a_node_does_not_select_it(cx: &mut TestAppContext) {
    let window = open(cx);
    window
        .update(cx, |graph, _, cx| {
            graph.spinning = false;
            graph.set_projection(projection(&["a"], &[]), cx);
        })
        .unwrap();
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    window
        .update(visual, |_, window, _| window.refresh())
        .unwrap();
    visual.run_until_parked();
    let fit = visual.debug_bounds("knowledge-graph-fit").unwrap();
    window
        .update(visual, |graph, _, _| {
            let origin = graph.bounds.get().origin;
            let local = fit.center() - origin;
            graph.projected = vec![Some(Projected {
                x: f32::from(local.x),
                y: f32::from(local.y),
                depth: 100.,
                scale: 1.,
            })];
            graph.radii = vec![30.];
        })
        .unwrap();
    visual.simulate_click(fit.center(), Default::default());
    window
        .update(visual, |graph, _, _| {
            assert!(graph.selected.is_none());
        })
        .unwrap();
}
