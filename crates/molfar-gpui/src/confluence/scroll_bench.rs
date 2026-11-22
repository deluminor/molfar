use std::{collections::HashMap, time::Instant};

use gpui::{ScrollDelta, ScrollWheelEvent, TestAppContext, point, px};
use molfar_core::confluence::{
    connector::{Kind, Node},
    document::adf,
    page::Page,
    tree::Children,
};

use super::{
    render::DocumentView,
    tests::{confluence_window, guide_page, node, space},
};

const ROOTS: usize = 400;
const CHILDREN: usize = 4;
const FRAMES: usize = 40;

fn long_page() -> Page {
    let rich = include_str!("../../../molfar-core/src/confluence/document/fixtures/rich.json");
    let mut document = adf::parse(rich).unwrap();
    let copy = document.0.clone();
    for _ in 0..40 {
        document.0.extend(copy.iter().cloned());
    }
    Page {
        document,
        images: HashMap::new(),
        ..guide_page()
    }
}

fn wheel(visual: &mut gpui::VisualTestContext, x: f32, y: f32) -> f64 {
    let start = Instant::now();
    for _ in 0..FRAMES {
        visual.simulate_event(ScrollWheelEvent {
            position: point(px(x), px(y)),
            delta: ScrollDelta::Pixels(point(px(0.), px(-24.))),
            ..Default::default()
        });
        visual.run_until_parked();
    }
    start.elapsed().as_secs_f64() * 1000. / FRAMES as f64
}

#[gpui::test]
#[ignore = "benchmark: cargo test -p molfar-gpui confluence_scroll_frame_time -- --ignored --nocapture"]
fn confluence_scroll_frame_time(cx: &mut TestAppContext) {
    let (window, mut visual) = confluence_window(cx);
    window
        .update(&mut visual, |view, _, cx| {
            view.connected = true;
            view.spaces.push(space());
            view.selected_space = Some("1".into());
            let mut roots = Vec::new();
            for root in 0..ROOTS {
                let id = format!("r{root}");
                roots.push(node(
                    &id,
                    &format!(
                        "STAGE {root}. Signal generation and minimum balance protection backtest"
                    ),
                    Kind::Page,
                ));
                view.expanded.insert(id.clone());
                view.branches.insert(
                    id.clone(),
                    Children {
                        nodes: (0..CHILDREN)
                            .map(|child| {
                                node(
                                    &format!("{id}c{child}"),
                                    &format!("MINI backtest for stage {child}"),
                                    Kind::Page,
                                )
                            })
                            .collect(),
                        cursor: None,
                    },
                );
            }
            view.branches.insert(
                String::new(),
                Children {
                    nodes: roots,
                    cursor: Some("next".into()),
                },
            );
            view.selected_node = Some(Node {
                ..node("42", "Guide", Kind::Page)
            });
            view.document = Some(DocumentView::new(long_page(), Vec::new(), ""));
            view.rebuild_rows();
            cx.notify();
        })
        .unwrap();
    visual.run_until_parked();

    let tree = wheel(&mut visual, 80., 300.);
    let document = wheel(&mut visual, 700., 300.);
    eprintln!(
        "confluence scroll: tree {tree:.2} ms/frame, document {document:.2} ms/frame ({} rows)",
        ROOTS * (CHILDREN + 1)
    );
}
