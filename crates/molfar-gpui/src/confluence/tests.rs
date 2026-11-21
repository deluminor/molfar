use std::{
    collections::HashMap,
    path::Path,
    sync::{Arc, Mutex},
};

use gpui::{App, AppContext, TestAppContext, VisualTestContext, WindowOptions};
use molfar_core::{
    confluence::{
        connector::{Kind, Node},
        document::adf,
        error::ConfluenceError,
        page::Page,
        spaces::Space,
        tree::Children,
    },
    secrets::SecretStore,
    store::Store,
};

use super::{View, render::DocumentView};

#[gpui::test]
fn confluence_renders_reader_and_keeps_it_open_on_error(cx: &mut TestAppContext) {
    let window = cx.update(|cx: &mut App| {
        cx.open_window(WindowOptions::default(), |_, cx| {
            cx.new(|cx| {
                View::new(
                    Arc::new(Mutex::new(Store::open(Path::new(":memory:")).unwrap())),
                    SecretStore::in_memory(),
                    cx,
                )
            })
        })
        .unwrap()
    });
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    assert!(visual.debug_bounds("confluence-disconnected").is_some());

    window
        .update(visual, |view, _, cx| {
            view.connected = true;
            view.spaces.push(Space {
                id: "1".into(),
                key: "TEAM".into(),
                title: "Team".into(),
                homepage_id: None,
                url: "https://example.invalid/wiki/spaces/TEAM".into(),
            });
            view.selected_space = Some("1".into());
            let page = Page {
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
            };
            view.branches.insert(
                String::new(),
                Children {
                    nodes: vec![Node {
                        id: page.id.clone(),
                        title: page.title.clone(),
                        url: page.url.clone(),
                        kind: Kind::Page,
                        space_key: "TEAM".into(),
                    }],
                    cursor: None,
                },
            );
            view.document = Some(DocumentView::new(page, Vec::new(), "Guide"));
            assert!(view.tree_key("down", cx));
            cx.notify();
        })
        .unwrap();
    visual.run_until_parked();
    for selector in [
        "confluence-tree-row-42",
        "confluence-breadcrumb",
        "confluence-outline-entry",
        "knowledge-properties",
        "confluence-callout",
        "confluence-status",
        "confluence-expand",
        "confluence-placeholder",
    ] {
        assert!(
            visual.debug_bounds(selector).is_some(),
            "{selector} is shown"
        );
    }

    for error in [
        ConfluenceError::Offline,
        ConfluenceError::Unauthorized,
        ConfluenceError::Forbidden,
        ConfluenceError::NotFound,
        ConfluenceError::RateLimited(2),
    ] {
        window
            .update(visual, |view, _, cx| {
                view.failure(error.to_string());
                assert_eq!(view.error.as_deref(), Some(error.to_string().as_str()));
                assert_eq!(view.document.as_ref().unwrap().page.id, "42");
                cx.notify();
            })
            .unwrap();
        visual.run_until_parked();
        assert!(visual.debug_bounds("confluence-error").is_some());
        assert!(visual.debug_bounds("confluence-document").is_some());
    }
}
