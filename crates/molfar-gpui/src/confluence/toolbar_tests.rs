use std::{
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};

use gpui::{
    AppContext, Bounds, TestAppContext, VisualTestContext, WindowBounds, WindowOptions, point, px,
    size,
};
use molfar_core::{
    confluence::document::{Document, Node},
    secrets::SecretStore,
    store::Store,
};

use super::{View, render::DocumentView, tests::guide_page};

#[gpui::test]
fn confluence_toolbar_fits_the_reader_and_keeps_selection_and_chat_actions(
    cx: &mut TestAppContext,
) {
    for width in [620., 1120.] {
        let window = cx.update(|cx| {
            cx.open_window(
                WindowOptions {
                    window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                        point(px(0.), px(0.)),
                        size(px(width), px(680.)),
                    ))),
                    ..Default::default()
                },
                |_, cx| {
                    cx.new(|cx| {
                        let mut view = View::new(
                            Arc::new(Mutex::new(Store::open(Path::new(":memory:")).unwrap())),
                            SecretStore::in_memory(),
                            cx,
                        );
                        let mut page = guide_page();
                        page.document =
                            Document(vec![Node::Media("image-id".into(), "Diagram".into())]);
                        page.images.insert(
                            "image-id".into(),
                            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                                .join("assets/molfar-native.png"),
                        );
                        view.connected = true;
                        view.document = Some(DocumentView::new(page, Vec::new(), ""));
                        view
                    })
                },
            )
            .unwrap()
        });
        let visual = &mut VisualTestContext::from_window(window.into(), cx);
        visual.run_until_parked();
        let toolbar = visual.debug_bounds("confluence-breadcrumb").unwrap();
        for selector in [
            "confluence-copy-link-Copy link",
            "confluence-select-text-Select text",
            "confluence-open-browser-Open in browser",
            "confluence-add-to-chat-Add to chat",
        ] {
            let bounds = visual.debug_bounds(selector).unwrap();
            assert!(bounds.left() >= toolbar.left() && bounds.right() <= toolbar.right());
            assert!(bounds.top() >= toolbar.top() && bounds.bottom() <= toolbar.bottom());
        }
        assert!(visual.debug_bounds("knowledge-image-10001").is_some());
        let select = visual.debug_bounds("confluence-select-text").unwrap();
        visual.simulate_click(select.center(), Default::default());
        visual.run_until_parked();
        assert!(
            visual
                .debug_bounds("confluence-select-text-Reading view")
                .is_some()
        );
        let chat = visual.debug_bounds("confluence-add-to-chat").unwrap();
        visual.simulate_click(chat.center(), Default::default());
        assert!(visual.debug_bounds("menu-action-page").is_some());
    }
}
