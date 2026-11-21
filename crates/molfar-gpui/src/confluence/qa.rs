use std::{collections::HashMap, path::Path, sync::Arc};

use gpui::{AppContext, HeadlessAppContext, WindowHandle, px, size};
use molfar_core::{
    confluence::{
        connector::{Kind, Node},
        document::adf,
        page::Page,
        spaces::Space,
        tree::Children,
    },
    secrets::SecretStore,
    store::Store,
};

use super::{View, render::DocumentView};
use crate::{assets::Assets, composer_completion::Completion, input};

#[test]
#[ignore]
fn write_confluence_qa_screenshots() {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../docs/specs/confluence-gpui/qa");
    std::fs::create_dir_all(&dir).unwrap();
    let mut cx = HeadlessAppContext::with_platform(
        Arc::new(gpui_apple::AppleTextSystem::new()),
        Arc::new(Assets),
        || {
            Ok(Some(Box::new(
                gpui_apple::metal_renderer::MetalHeadlessRenderer::new(),
            )))
        },
    );
    cx.update(|cx| {
        cx.set_reduce_motion(true);
        input::bind(cx);
        crate::composer_completion::bind(cx);
        crate::popover::bind(cx);
    });

    let window = reader(&mut cx);
    save(&mut cx, &window, &dir.join("disconnected.png"));
    window
        .update(&mut cx, |view, _, cx| {
            view.connected = true;
            view.spaces.push(Space {
                id: "1".into(),
                key: "TEAM".into(),
                title: "Team".into(),
                homepage_id: None,
                url: "https://example.invalid/wiki/spaces/TEAM".into(),
            });
            view.selected_space = Some("1".into());
            view.branches.insert(
                String::new(),
                Children {
                    nodes: vec![Node {
                        id: "42".into(),
                        title: "Guide".into(),
                        url: "https://example.invalid/wiki/spaces/TEAM/pages/42".into(),
                        kind: Kind::Page,
                        space_key: "TEAM".into(),
                    }],
                    cursor: None,
                },
            );
            cx.notify();
        })
        .unwrap();
    save(&mut cx, &window, &dir.join("tree.png"));
    window
        .update(&mut cx, |view, _, cx| {
            let page = sample_page();
            view.document = Some(DocumentView::new(page, Vec::new(), "Guide"));
            cx.notify();
        })
        .unwrap();
    save(&mut cx, &window, &dir.join("page.png"));
    window
        .update(&mut cx, |view, _, cx| {
            view.failure("Confluence is unreachable. Cached pages still open.".into());
            cx.notify();
        })
        .unwrap();
    save(&mut cx, &window, &dir.join("error.png"));

    let mention = cx
        .open_window(size(px(720.), px(420.)), |_, cx| {
            cx.new(|cx| {
                let field = cx.new(input::Input::new);
                Completion::preview(field, "/not-a-real-project".into(), cx)
            })
        })
        .unwrap();
    mention
        .update(&mut cx, |view, window, cx| {
            view.show_confluence_match(
                Node {
                    id: "42".into(),
                    title: "Guide".into(),
                    kind: Kind::Page,
                    space_key: "TEAM".into(),
                    url: "https://example.invalid/wiki".into(),
                },
                window,
                cx,
            );
        })
        .unwrap();
    save(&mut cx, &mention, &dir.join("mention.png"));
}

fn reader(cx: &mut HeadlessAppContext) -> WindowHandle<View> {
    let root = std::env::temp_dir().join(format!("molfar-confluence-qa-{}", std::process::id()));
    let _ = std::fs::create_dir_all(&root);
    cx.open_window(size(px(1200.), px(800.)), move |_, cx| {
        cx.new(|cx| {
            View::new(
                Arc::new(std::sync::Mutex::new(
                    Store::open(&root.join("native.sqlite")).unwrap(),
                )),
                SecretStore::in_memory(),
                cx,
            )
        })
    })
    .unwrap()
}

fn save<V: 'static>(cx: &mut HeadlessAppContext, window: &WindowHandle<V>, path: &Path) {
    window.update(cx, |_, window, _| window.refresh()).ok();
    cx.run_until_parked();
    let image = cx
        .capture_screenshot((*window).into())
        .expect("render screenshot");
    assert!(image.width() > 0 && image.height() > 0);
    image.save(path).expect("write screenshot");
}

fn sample_page() -> Page {
    Page {
        id: "42".into(),
        title: "Guide".into(),
        url: "https://example.invalid/wiki/spaces/TEAM/pages/42".into(),
        space_id: "1".into(),
        parent_id: None,
        parent_kind: Kind::Page,
        version: 1,
        updated: "2024-01-01".into(),
        author: "Reader".into(),
        labels: vec!["guide".into()],
        document: adf::parse(include_str!(
            "../../../molfar-core/src/confluence/document/fixtures/rich.json"
        ))
        .unwrap(),
        images: HashMap::new(),
    }
}
