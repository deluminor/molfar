use std::{
    path::Path,
    sync::{Arc, Mutex},
};

use gpui::{
    AnyElement, App, AppContext, Context, Entity, IntoElement, ParentElement, Render, Styled,
    TestAppContext, VisualTestContext, Window, WindowOptions, div, px,
};
use molfar_core::{
    confluence::{connector::Kind, tree::Children},
    secrets::SecretStore,
    store::Store,
};

use super::{
    View,
    slots::Slots,
    tests::{node, space},
};

/// Hosts the slots in flex columns, as the Inbox does.
struct Host {
    slots: Slots,
}

impl Render for Host {
    fn render(&mut self, _: &mut Window, _: &mut Context<Self>) -> impl IntoElement {
        let column = |child: AnyElement| div().h_full().flex().flex_col().child(child);
        div()
            .size_full()
            .flex()
            .child(column(self.slots.tree()).w(px(300.)))
            .child(column(self.slots.reader()).flex_1())
    }
}

fn connected_view(cx: &mut App) -> Entity<View> {
    cx.new(|cx| {
        let mut view = View::new(
            Arc::new(Mutex::new(Store::open(Path::new(":memory:")).unwrap())),
            SecretStore::in_memory(),
            cx,
        );
        view.connected = true;
        view.spaces.push(space());
        view.selected_space = Some("1".into());
        view.branches.insert(
            String::new(),
            Children {
                nodes: vec![node("r1", "Overview", Kind::Page)],
                cursor: None,
            },
        );
        view.rebuild_rows();
        view
    })
}

#[gpui::test]
fn hosted_slots_give_the_tree_its_full_height(cx: &mut TestAppContext) {
    let window = cx.update(|cx| {
        cx.open_window(WindowOptions::default(), |_, cx| {
            let view = connected_view(cx);
            cx.new(|cx| Host {
                slots: Slots::new(&view, cx),
            })
        })
        .unwrap()
    });
    let mut visual = VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();

    let tree = visual.debug_bounds("confluence").expect("tree pane");
    assert!(tree.size.height > px(200.), "{tree:?}");
}
