use std::{
    collections::HashMap,
    path::Path,
    sync::{Arc, Mutex},
};

use gpui::{App, AppContext, TestAppContext, VisualTestContext, WindowOptions, px};
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

use super::{
    View,
    reader::script_page_open,
    render::{DocumentView, ReaderBlock},
};
use crate::markdown_model::Block;

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
            assert!(view.document.as_ref().unwrap().blocks.iter().any(|block| {
                matches!(
                    block,
                    ReaderBlock::Common(Block::Heading { runs, .. })
                        if runs.iter().any(|run| run.style.search.is_some())
                )
            }));
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

    window
        .update(visual, |view, _, cx| {
            view.open_page("404".into(), false, cx);
            assert_eq!(view.document.as_ref().unwrap().page.id, "42");
        })
        .unwrap();
    visual.run_until_parked();
    window
        .update(visual, |view, _, _| {
            assert_eq!(view.document.as_ref().unwrap().page.id, "42");
            assert!(view.error.is_some());
        })
        .unwrap();
    visual.run_until_parked();
    assert!(visual.debug_bounds("confluence-error").is_some());
    assert!(visual.debug_bounds("confluence-document").is_some());
}

#[gpui::test]
fn confluence_tree_loads_the_next_page_of_a_branch_that_is_not_the_tail(cx: &mut TestAppContext) {
    let (window, mut visual) = confluence_window(cx);
    let visual = &mut visual;
    window
        .update(visual, |view, _, cx| {
            view.connected = true;
            view.spaces.push(space());
            view.selected_space = Some("1".into());
            view.branches.insert(
                String::new(),
                Children {
                    nodes: vec![
                        node("10", "First", Kind::Folder),
                        node("12", "Second", Kind::Page),
                    ],
                    cursor: None,
                },
            );
            view.branches.insert(
                "10".into(),
                Children {
                    nodes: vec![node("11", "Child", Kind::Page)],
                    cursor: Some("next".into()),
                },
            );
            view.expanded.insert("10".into());
            cx.notify();
        })
        .unwrap();
    visual.run_until_parked();
    window
        .update(visual, |view, _, cx| {
            assert!(
                view.tree_scroll.bounds_for_item(0).is_some(),
                "tree was not painted"
            );
            let max = view.tree_scroll.max_offset();
            view.tree_scroll.set_offset(gpui::point(px(0.), -max.y));
            view.tree_scrolled(cx);
            assert!(
                view.pending.contains("10"),
                "visible branch end was ignored: {:?}",
                view.pending
            );
            assert!(!view.pending.contains(""));
        })
        .unwrap();
}

#[gpui::test]
fn confluence_expanded_row_does_not_page_its_parent(cx: &mut TestAppContext) {
    let (window, mut visual) = confluence_window(cx);
    let visual = &mut visual;
    window
        .update(visual, |view, _, cx| {
            view.connected = true;
            view.spaces.push(space());
            view.selected_space = Some("1".into());
            let mut nodes = Vec::new();
            for index in 0..80 {
                nodes.push(node(&format!("p{index}"), "Page", Kind::Page));
            }
            nodes.push(node("10", "Folder", Kind::Folder));
            nodes.push(node("12", "Sibling", Kind::Page));
            view.branches.insert(
                String::new(),
                Children {
                    nodes,
                    cursor: Some("more".into()),
                },
            );
            view.branches.insert(
                "10".into(),
                Children {
                    nodes: vec![
                        node("11", "One", Kind::Page),
                        node("13", "Two", Kind::Page),
                        node("14", "Three", Kind::Page),
                    ],
                    cursor: None,
                },
            );
            view.expanded.insert("10".into());
            cx.notify();
        })
        .unwrap();
    visual.run_until_parked();
    window
        .update(visual, |view, _, cx| {
            let rows = view.rows();
            let folder = rows.iter().position(|row| row.node.id == "10").unwrap();
            let sibling = rows.iter().position(|row| row.node.id == "12").unwrap();
            let row = view
                .tree_scroll
                .bounds_for_item(folder)
                .expect("folder painted");
            let viewport = view.tree_scroll.bounds();
            let mut offset = viewport.bottom() - row.bottom();
            let max = view.tree_scroll.max_offset().y;
            if offset < -max {
                offset = -max;
            }
            if offset > px(0.) {
                offset = px(0.);
            }
            view.tree_scroll.set_offset(gpui::point(px(0.), offset));
            let viewport_bottom = viewport.bottom() - view.tree_scroll.offset().y;
            let folder_distance =
                viewport_bottom - view.tree_scroll.bounds_for_item(folder).unwrap().bottom();
            let sibling_distance =
                viewport_bottom - view.tree_scroll.bounds_for_item(sibling).unwrap().bottom();
            assert!(
                folder_distance >= px(-64.) && folder_distance <= px(64.),
                "folder is not at the pane bottom: {folder_distance:?}"
            );
            assert!(
                sibling_distance < px(-64.),
                "sibling is still near the pane bottom: {sibling_distance:?}"
            );
            view.tree_scrolled(cx);
            assert!(
                !view.pending.contains(""),
                "expanded folder paged its parent: {:?}",
                view.pending
            );
            assert!(!view.pending.contains("10"));
        })
        .unwrap();
}

#[gpui::test]
fn confluence_page_is_shown_before_ancestors_resolve(cx: &mut TestAppContext) {
    let (window, mut visual) = confluence_window(cx);
    let visual = &mut visual;
    let (gate_tx, gate_rx) = async_channel::bounded(1);
    let mut nested = guide_page();
    nested.id = "99".into();
    nested.title = "Nested".into();
    nested.parent_id = Some("20".into());
    script_page_open(
        Ok(nested),
        vec![node("20", "Parent", Kind::Page)],
        Vec::new(),
        gate_rx,
    );
    cx.executor().allow_parking();
    window
        .update(visual, |view, _, cx| {
            view.connected = true;
            view.document = Some(DocumentView::new(guide_page(), Vec::new(), ""));
            view.open_page("99".into(), false, cx);
        })
        .unwrap();
    visual.run_until_parked();
    window
        .update(visual, |view, _, _| {
            let document = view.document.as_ref().unwrap();
            assert_eq!(document.page.id, "99");
            assert!(document.ancestors.is_empty());
            assert!(view.error.is_none());
        })
        .unwrap();
    gate_tx.send_blocking(()).unwrap();
    visual.run_until_parked();
    window
        .update(visual, |view, _, _| {
            let document = view.document.as_ref().unwrap();
            assert_eq!(document.page.id, "99");
            assert_eq!(document.ancestors[0].id, "20");
            assert!(view.error.is_none());
        })
        .unwrap();
}

#[gpui::test]
fn confluence_late_ancestors_do_not_replace_a_newer_page(cx: &mut TestAppContext) {
    let (window, mut visual) = confluence_window(cx);
    let visual = &mut visual;
    let (gate_tx, gate_rx) = async_channel::bounded(1);
    let mut nested = guide_page();
    nested.id = "99".into();
    nested.parent_id = Some("20".into());
    script_page_open(
        Ok(nested),
        vec![node("20", "Parent", Kind::Page)],
        Vec::new(),
        gate_rx,
    );
    cx.executor().allow_parking();
    window
        .update(visual, |view, _, cx| {
            view.document = Some(DocumentView::new(guide_page(), Vec::new(), ""));
            view.open_page("99".into(), false, cx);
        })
        .unwrap();
    visual.run_until_parked();
    window
        .update(visual, |view, _, cx| {
            assert_eq!(view.document.as_ref().unwrap().page.id, "99");
            view.page_generation += 1;
            view.open_page("404".into(), false, cx);
        })
        .unwrap();
    visual.run_until_parked();
    gate_tx.send_blocking(()).unwrap();
    visual.run_until_parked();
    window
        .update(visual, |view, _, _| {
            let document = view.document.as_ref().unwrap();
            assert_eq!(document.page.id, "99");
            assert!(document.ancestors.is_empty());
            assert!(view.error.is_some());
        })
        .unwrap();
}

#[gpui::test]
fn confluence_breadcrumbs_keep_ancestors_and_folder_children_select_the_tree(
    cx: &mut TestAppContext,
) {
    let (window, mut visual) = confluence_window(cx);
    let visual = &mut visual;
    window
        .update(visual, |view, _, cx| {
            view.connected = true;
            view.spaces.push(space());
            view.selected_space = Some("1".into());
            let mut page = guide_page();
            page.parent_id = Some("20".into());
            let mut document = DocumentView::new(page, vec![node("11", "Notes", Kind::Folder)], "");
            document.ancestors = vec![
                node("10", "Section", Kind::Folder),
                node("20", "Parent", Kind::Page),
            ];
            view.document = Some(document);
            cx.notify();
        })
        .unwrap();
    visual.run_until_parked();
    assert!(visual.debug_bounds("confluence-breadcrumb-10").is_some());
    assert!(visual.debug_bounds("confluence-breadcrumb-20").is_some());
    assert!(visual.debug_bounds("confluence-relation-11").is_some());

    window
        .update(visual, |view, _, cx| {
            view.branches.insert(
                String::new(),
                Children {
                    nodes: vec![node("10", "Section", Kind::Folder)],
                    cursor: None,
                },
            );
            view.branches.insert(
                "10".into(),
                Children {
                    nodes: vec![node("20", "Parent", Kind::Page)],
                    cursor: None,
                },
            );
            if let Some(document) = view.document.as_mut() {
                document.ancestors.clear();
            }
            view.open_target("11".into(), cx);
            assert_eq!(view.selected_node.as_ref().unwrap().id, "11");
            assert_eq!(view.selected_node.as_ref().unwrap().kind, Kind::Folder);
            cx.notify();
        })
        .unwrap();
    visual.run_until_parked();
    window
        .update(visual, |view, _, cx| {
            let mut page = guide_page();
            page.parent_id = Some("20".into());
            view.document = Some(DocumentView::new(page, Vec::new(), ""));
            cx.notify();
        })
        .unwrap();
    visual.run_until_parked();
    assert!(visual.debug_bounds("confluence-breadcrumb-10").is_some());
    assert!(visual.debug_bounds("confluence-breadcrumb-20").is_some());
}

#[gpui::test]
fn confluence_space_switcher_keeps_hidden_spaces_out_of_the_destination_list(
    cx: &mut TestAppContext,
) {
    let (window, mut visual) = confluence_window(cx);
    let visual = &mut visual;
    window
        .update(visual, |view, _, cx| {
            view.connected = true;
            view.space_menu = true;
            view.spaces.push(space());
            let mut hidden = space();
            hidden.id = "2".into();
            hidden.key = "SECRET".into();
            hidden.title = "Secret".into();
            view.spaces.push(hidden);
            view.hidden.insert("2".into());
            view.selected_space = Some("1".into());
            cx.notify();
        })
        .unwrap();
    visual.run_until_parked();
    assert!(visual.debug_bounds("confluence-space-1").is_some());
    assert!(visual.debug_bounds("confluence-space-2").is_none());
    assert!(visual.debug_bounds("confluence-hidden-spaces").is_some());
    assert!(visual.debug_bounds("confluence-show-2").is_some());
}

fn confluence_window(cx: &mut TestAppContext) -> (gpui::WindowHandle<View>, VisualTestContext) {
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
    let visual = VisualTestContext::from_window(window.into(), cx);
    (window, visual)
}

fn space() -> Space {
    Space {
        id: "1".into(),
        key: "TEAM".into(),
        title: "Team".into(),
        homepage_id: None,
        url: "https://example.invalid/wiki/spaces/TEAM".into(),
    }
}

fn node(id: &str, title: &str, kind: Kind) -> Node {
    Node {
        id: id.into(),
        title: title.into(),
        kind,
        space_key: "TEAM".into(),
        url: format!("https://example.invalid/wiki/{id}"),
    }
}

fn guide_page() -> Page {
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

#[test]
fn confluence_qa_screenshots_are_saved() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../docs/specs/confluence-gpui/qa");
    for name in [
        "disconnected.png",
        "tree.png",
        "page.png",
        "error.png",
        "mention.png",
    ] {
        let bytes = std::fs::read(root.join(name)).unwrap_or_else(|_| panic!("missing {name}"));
        assert!(bytes.starts_with(&[0x89, b'P', b'N', b'G', b'\r', b'\n', 0x1a, b'\n']));
        assert!(bytes.len() > 8_000, "{name}");
    }
}

#[test]
fn confluence_gpui_sources_do_not_depend_on_the_tauri_connector() {
    fn visit(dir: &std::path::Path) {
        for entry in std::fs::read_dir(dir).unwrap() {
            let path = entry.unwrap().path();
            if path.is_dir() {
                visit(&path);
                continue;
            }
            if path.extension().is_some_and(|ext| ext == "rs") {
                let text = std::fs::read_to_string(&path).unwrap();
                for needle in [["src", "-tauri"].concat(), ["src", "_tauri"].concat()] {
                    assert!(!text.contains(&needle), "{}", path.display());
                }
            }
        }
    }

    visit(&std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("src/confluence"));
}
