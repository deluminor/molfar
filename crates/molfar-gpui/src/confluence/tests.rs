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
            view.rebuild_rows();
            assert!(view.tree_key("down", cx));
            view.rebuild_rows();
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
    ] {
        assert!(
            visual.debug_bounds(selector).is_some(),
            "{selector} is shown"
        );
    }
    reveal_document_end(window, visual);
    assert!(visual.debug_bounds("confluence-placeholder").is_some());

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
                view.rebuild_rows();
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
        .update(visual, |view, _, _| {
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
            view.rebuild_rows();
            assert_eq!(
                view.page_candidate(0..view.rows().len()).as_deref(),
                Some("10"),
                "visible branch end was ignored"
            );
            view.pending.insert("10".into());
            assert_eq!(
                view.page_candidate(0..view.rows().len()),
                None,
                "no duplicate request"
            );
        })
        .unwrap();
}

#[gpui::test]
fn confluence_expanded_row_does_not_page_its_parent(cx: &mut TestAppContext) {
    let (window, mut visual) = confluence_window(cx);
    let visual = &mut visual;
    window
        .update(visual, |view, _, _| {
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
            view.rebuild_rows();
            let rows = view.rows();
            let folder = rows.iter().position(|row| row.node.id == "10").unwrap();
            let sibling = rows.iter().position(|row| row.node.id == "12").unwrap();
            assert_eq!(sibling, folder + 4);
            assert_eq!(
                view.page_candidate(folder.saturating_sub(20)..folder + 1),
                None,
                "expanded folder paged its parent"
            );
            assert_eq!(
                view.page_candidate(sibling - 20..sibling + 1).as_deref(),
                Some(""),
                "the root pages once its tail is in view"
            );
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
            view.rebuild_rows();
            cx.notify();
        })
        .unwrap();
    visual.run_until_parked();
    assert!(visual.debug_bounds("confluence-breadcrumb-10").is_some());
    assert!(visual.debug_bounds("confluence-breadcrumb-20").is_some());
    reveal_document_end(window, visual);
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
            view.rebuild_rows();
            cx.notify();
        })
        .unwrap();
    visual.run_until_parked();
    window
        .update(visual, |view, _, cx| {
            let mut page = guide_page();
            page.parent_id = Some("20".into());
            view.document = Some(DocumentView::new(page, Vec::new(), ""));
            view.rebuild_rows();
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
            view.rebuild_rows();
            cx.notify();
        })
        .unwrap();
    visual.run_until_parked();
    assert!(visual.debug_bounds("confluence-space-1").is_some());
    assert!(visual.debug_bounds("confluence-space-2").is_none());
    assert!(visual.debug_bounds("confluence-hidden-spaces").is_some());
    assert!(visual.debug_bounds("confluence-show-2").is_some());
}

pub(super) fn confluence_window(
    cx: &mut TestAppContext,
) -> (gpui::WindowHandle<View>, VisualTestContext) {
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

/// The body is virtualized: blocks below the fold are built once scrolled to.
fn reveal_document_end(window: gpui::WindowHandle<View>, visual: &mut VisualTestContext) {
    window
        .update(visual, |view, _, cx| {
            view.document_list.scroll_to_end();
            cx.notify();
        })
        .unwrap();
    visual.run_until_parked();
}

pub(super) fn space() -> Space {
    Space {
        id: "1".into(),
        key: "TEAM".into(),
        title: "Team".into(),
        homepage_id: None,
        url: "https://example.invalid/wiki/spaces/TEAM".into(),
    }
}

pub(super) fn node(id: &str, title: &str, kind: Kind) -> Node {
    Node {
        id: id.into(),
        title: title.into(),
        kind,
        space_key: "TEAM".into(),
        url: format!("https://example.invalid/wiki/{id}"),
    }
}

pub(super) fn guide_page() -> Page {
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

#[gpui::test]
fn confluence_tree_indents_levels_keeps_titles_on_one_line_and_builds_only_visible_rows(
    cx: &mut TestAppContext,
) {
    let (window, mut visual) = confluence_window(cx);
    let visual = &mut visual;
    let long = "MINI backtest for stage 1,2,3,4 with a title far wider than the tree pane";
    window
        .update(visual, |view, _, cx| {
            view.connected = true;
            view.spaces.push(space());
            view.selected_space = Some("1".into());
            let mut roots = vec![node("10", "Research", Kind::Folder)];
            roots.extend((0..500).map(|index| node(&format!("p{index}"), long, Kind::Page)));
            view.branches.insert(
                String::new(),
                Children {
                    nodes: roots,
                    cursor: None,
                },
            );
            view.branches.insert(
                "10".into(),
                Children {
                    nodes: vec![node("11", long, Kind::Page)],
                    cursor: None,
                },
            );
            view.expanded.insert("10".into());
            view.rebuild_rows();
            cx.notify();
        })
        .unwrap();
    visual.run_until_parked();

    let parent = visual.debug_bounds("confluence-tree-row-10").unwrap();
    let child = visual.debug_bounds("confluence-tree-row-11").unwrap();
    let next = visual.debug_bounds("confluence-tree-row-p0").unwrap();
    assert_eq!(parent.size.height, px(28.), "one line per row");
    assert_eq!(child.size.height, px(28.), "long titles never wrap");
    assert!(
        child.top() >= parent.bottom() && next.top() >= child.bottom(),
        "rows never overlap"
    );
    let parent_title = visual.debug_bounds("confluence-tree-title-10").unwrap();
    let child_title = visual.debug_bounds("confluence-tree-title-11").unwrap();
    assert_eq!(
        child_title.left() - parent_title.left(),
        px(16.),
        "one indent per level"
    );
    assert!(
        child_title.right() <= child.right(),
        "the title is clipped inside its row"
    );
    window
        .update(visual, |view, _, _| {
            assert_eq!(view.rows()[1].depth, 1);
        })
        .unwrap();
    assert!(
        visual.debug_bounds("confluence-tree-row-p499").is_none(),
        "off-screen rows are not built"
    );
}
